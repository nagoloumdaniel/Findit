import { createAgentMemoryStore, createAgentRunStore } from "@findit/agent";
import type { CrawlResult, CrawledPage } from "@findit/crawler";
import type { ExtractModel, ExtractionResult, JobOffer, ModelUsage } from "@findit/extract";
import type {
  WebSearchProvider,
  WebSearchProviderHealth,
  WebSearchResult,
} from "@findit/job-connectors";
import { describe, expect, it } from "vitest";

import { runAgent } from "./run-agent.js";
import type { CrawlSource, ExtractJobs } from "./run-agent.js";
import { deterministicQueryPlanner } from "./planner.js";
import type { PlannerObservation, QueryPlanner } from "./planner.js";
import type { SourceSelector } from "./selector.js";

/** Une offre minimale et valide (titre, entreprise, URL de candidature). */
const makeOffer = (title: string, company: string): JobOffer => ({
  title,
  company,
  technologies: [],
  applicationUrl: `https://example.com/postes/${encodeURIComponent(title)}`,
  sourceUrl: "https://example.com/jobs",
  sourceDomain: "example.com",
});

/** Une page crawlée lisible, avec un texte simple qui nomme un contrat. */
const makePage = (url: string): CrawledPage => ({
  url,
  depth: 0,
  html: "<html><body>offre en alternance</body></html>",
  text: "offre en alternance",
  status: 200,
  robotsDenied: false,
});

/** Un moteur de recherche doublé qui rend toujours les mêmes résultats. */
const makeSearch = (results: readonly WebSearchResult[]): WebSearchProvider => ({
  name: "doublure",
  search: () => Promise.resolve(results),
  healthCheck: (): Promise<WebSearchProviderHealth> =>
    Promise.resolve({ healthy: true, detail: "La doublure répond." }),
});

/** Un modèle jamais appelé : l'extraction est doublée dans ces tests. */
const unusedModel: ExtractModel = {
  generateStructured<T>(): Promise<T> {
    throw new Error("Le modèle ne doit pas être appelé : l'extraction est doublée.");
  },
};

/** Le résultat de crawl d'une source saine : une seule page. */
const successCrawl = (startUrl: string): CrawlResult => ({
  pages: [makePage(startUrl)],
  stopReason: "completed",
  truncated: false,
  visitedCount: 1,
  robotsDeniedCount: 0,
});

// ---------------------------------------------------------------------------
// Faux Prisma
// ---------------------------------------------------------------------------

const COUNTER_KEYS = [
  "searches",
  "pages",
  "extracted",
  "validated",
  "duplicates",
  "inserted",
  "errors",
] as const;

interface StoredRun {
  readonly objective: string;
  status: string;
  readonly counters: Record<string, number>;
  costMicroUsd: number;
  endedAt: Date | null;
}

interface StoredAction {
  readonly agentRunId: string;
  readonly kind: string;
  readonly detail: string | null;
  readonly costMicroUsd: number;
}

interface StoredError {
  readonly agentRunId: string;
  readonly kind: string;
  readonly message: string;
  readonly retried: boolean;
}

interface StoredMemory {
  readonly kind: string;
  readonly key: string;
  value: unknown;
}

const isIncrement = (value: unknown): value is { readonly increment: number } =>
  typeof value === "object" &&
  value !== null &&
  "increment" in value &&
  typeof (value as { readonly increment: unknown }).increment === "number";

/**
 * Un faux Prisma tenu en mémoire. Il applique le contrat d'écriture des
 * run-stores et de la mémoire de `@findit/agent`, ce qui rend les compteurs et
 * la séquence d'actions vérifiables sans base.
 */
const buildFakePrisma = () => {
  const runs = new Map<string, StoredRun>();
  const actions: StoredAction[] = [];
  const errors: StoredError[] = [];
  const memories = new Map<string, StoredMemory>();
  let nextId = 0;

  const prisma = {
    agentRun: {
      create: (args: {
        readonly data: { readonly objective: string };
        readonly select: { readonly id: true };
      }) => {
        nextId += 1;
        const id = `run-${String(nextId)}`;
        runs.set(id, {
          objective: args.data.objective,
          status: "RUNNING",
          counters: {
            searches: 0,
            pages: 0,
            extracted: 0,
            validated: 0,
            duplicates: 0,
            inserted: 0,
            errors: 0,
          },
          costMicroUsd: 0,
          endedAt: null,
        });
        return { id };
      },
      update: (args: {
        readonly where: { readonly id: string };
        readonly data: Record<string, unknown>;
      }) => {
        const run = runs.get(args.where.id);
        if (run === undefined) {
          throw new Error(`Exécution inconnue : ${args.where.id}`);
        }
        for (const [key, value] of Object.entries(args.data)) {
          if (isIncrement(value)) {
            if (key === "costMicroUsd") {
              run.costMicroUsd += value.increment;
            } else if (COUNTER_KEYS.includes(key as (typeof COUNTER_KEYS)[number])) {
              run.counters[key] = (run.counters[key] ?? 0) + value.increment;
            }
          } else if (key === "status" && typeof value === "string") {
            run.status = value;
          } else if (key === "endedAt" && value instanceof Date) {
            run.endedAt = value;
          }
        }
        return run;
      },
    },
    agentAction: {
      create: (args: { readonly data: StoredAction }) => {
        actions.push({ ...args.data });
        return args.data;
      },
    },
    agentError: {
      create: (args: { readonly data: StoredError }) => {
        errors.push({ ...args.data });
        return args.data;
      },
    },
    agentMemory: {
      upsert: (args: {
        readonly where: { readonly kind_key: { readonly kind: string; readonly key: string } };
        readonly create: {
          readonly kind: string;
          readonly key: string;
          readonly value?: unknown;
          readonly lastSeenAt: Date;
        };
        readonly update: { readonly value?: unknown; readonly lastSeenAt: Date };
      }) => {
        const { kind, key } = args.where.kind_key;
        const mapKey = `${kind}:${key}`;
        const existing = memories.get(mapKey);
        if (existing !== undefined) {
          if ("value" in args.update) {
            existing.value = args.update.value;
          }
        } else {
          memories.set(mapKey, {
            kind,
            key,
            value: "value" in args.create ? args.create.value : null,
          });
        }
        return {};
      },
      findUnique: (args: {
        readonly where: { readonly kind_key: { readonly kind: string; readonly key: string } };
        readonly select: { readonly id: true };
      }) => {
        const { kind, key } = args.where.kind_key;
        const mapKey = `${kind}:${key}`;
        return memories.has(mapKey) ? { id: mapKey } : null;
      },
    },
  };

  return { prisma, runs, actions, errors, memories };
};

type FakePrisma = ReturnType<typeof buildFakePrisma>;

interface DepsInput {
  readonly search: WebSearchProvider;
  readonly crawl: CrawlSource;
  readonly extract: ExtractJobs;
  readonly specializedExtract?: (page: CrawledPage) => ExtractionResult;
  readonly recoverPage?: (url: string) => Promise<CrawledPage | null>;
  readonly pageGate?: (page: CrawledPage) => boolean;
  readonly model?: ExtractModel;
  readonly modelCost?: (usage: ModelUsage) => number;
  readonly planner?: QueryPlanner;
  readonly sourceGate?: (
    url: string,
  ) => Promise<{ readonly allowed: boolean; readonly reason: string }>;
  readonly sourceSelector?: SourceSelector;
  readonly resolveUrl?: (url: string) => Promise<string | null>;
  readonly discoverSource?: (url: string) => Promise<string | null>;
}

/** Assemble les dépendances du run sur le faux Prisma partagé. */
const buildDeps = (fake: FakePrisma, input: DepsInput) => {
  const runStore = createAgentRunStore(
    fake.prisma as unknown as Parameters<typeof createAgentRunStore>[0],
  );
  const memoryStore = createAgentMemoryStore(
    fake.prisma as unknown as Parameters<typeof createAgentMemoryStore>[0],
  );
  return { runStore, memoryStore, model: unusedModel, ...input };
};

describe("runAgent", () => {
  it("enchaîne toute la boucle, cumule les compteurs et consigne les doublons", async () => {
    const fake = buildFakePrisma();
    const search = makeSearch([
      {
        url: "https://boards.greenhouse.io/acme/jobs",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "boards.greenhouse.io",
      },
      {
        url: "https://example.com/jobs",
        title: "Nos offres d'emploi",
        description: "Recrutement alternance",
        host: "example.com",
      },
      {
        url: "https://ecole-informatique.fr/formations",
        title: "Formation en alternance",
        description: "Devenez développeur",
        host: "ecole-informatique.fr",
      },
    ]);
    const crawl: CrawlSource = (options) => Promise.resolve(successCrawl(options.startUrl));
    const extract: ExtractJobs = (page) => {
      if (page.url.includes("greenhouse")) {
        return Promise.resolve({
          offers: [makeOffer("Développeur Full Stack", "Acme"), makeOffer("Data Analyst", "Acme")],
          rejected: [],
        });
      }
      return Promise.resolve({
        offers: [makeOffer("Développeur Full Stack", "Beta"), makeOffer("DevOps", "Beta")],
        rejected: [],
      });
    };

    const deps = buildDeps(fake, { search, crawl, extract });

    const result = await runAgent("offres d'alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({
      runId: "run-1",
      status: "SUCCEEDED",
      searchCount: 1,
      sourceCount: 2,
      pageCount: 2,
      extractedCount: 4,
      retainedCount: 3,
      errorCount: 0,
    });

    // L'enchaînement : planification, puis la recherche du tour, puis le choix
    // des sources, puis crawl et extraction par source, déduplication du doublon,
    // stockage du compte.
    expect(fake.actions.map((action) => action.kind)).toEqual([
      "DISCOVER",
      "SEARCH",
      "DISCOVER",
      "CRAWL",
      "EXTRACT",
      "CRAWL",
      "EXTRACT",
      "DEDUP",
      "STORE",
    ]);

    // Le compte des offres retenues est porté par l'action STORE.
    const storeAction = fake.actions.find((action) => action.kind === "STORE");
    expect(storeAction?.detail).toBe("3");

    // Les compteurs du run, tenus par le run-store. `extracted` compte les
    // offres trouvées (deux par page ici), pas les pages extraites.
    const run = fake.runs.get("run-1");
    expect(run?.status).toBe("SUCCEEDED");
    expect(run?.counters).toMatchObject({
      searches: 1,
      pages: 2,
      extracted: 4,
      duplicates: 1,
      inserted: 1,
      errors: 0,
    });

    // La source école est notée sous le seuil : elle n'est pas crawlée.
    expect(fake.memories.has("VISITED_URL:ecole-informatique.fr/formations")).toBe(false);
    // Les deux sources gardées ont été mémorisées après leur crawl, sous leur clé
    // normalisée (hôte sans www, sans requête ni slash final).
    expect(fake.memories.has("VISITED_URL:boards.greenhouse.io/acme/jobs")).toBe(true);
    expect(fake.memories.has("VISITED_URL:example.com/jobs")).toBe(true);
  });

  it("consigne une source qui échoue sans casser le run", async () => {
    const fake = buildFakePrisma();
    const search = makeSearch([
      {
        url: "https://broken.example.com/jobs",
        title: "Offres d'alternance",
        description: "Liste des postes",
        host: "broken.example.com",
      },
      {
        url: "https://example.com/jobs",
        title: "Nos offres d'emploi",
        description: "Recrutement alternance",
        host: "example.com",
      },
    ]);
    const crawl: CrawlSource = (options) => {
      if (options.startUrl.includes("broken")) {
        throw new Error("La source a répondu 503.");
      }
      return Promise.resolve(successCrawl(options.startUrl));
    };
    const extract: ExtractJobs = () =>
      Promise.resolve({
        offers: [makeOffer("Développeur Full Stack", "Acme")],
        rejected: [],
      });

    const deps = buildDeps(fake, { search, crawl, extract });

    const result = await runAgent("offres d'alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({
      status: "SUCCEEDED",
      searchCount: 1,
      sourceCount: 1,
      pageCount: 1,
      extractedCount: 1,
      retainedCount: 1,
      errorCount: 1,
    });

    // L'erreur de la source morte est consignée, avec son motif.
    expect(fake.errors).toHaveLength(1);
    expect(fake.errors[0]).toMatchObject({
      kind: "CRAWL",
      message: "La source a répondu 503.",
      retried: false,
    });

    // Le run est bien clôturé en succès : la source morte ne l'a pas fait échouer.
    expect(fake.runs.get("run-1")?.status).toBe("SUCCEEDED");
    expect(fake.runs.get("run-1")?.counters.errors).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Cascade de récupération (cahier des charges, section 4.7)
// ---------------------------------------------------------------------------

/** Une page revenue vide : ni HTML, ni texte, aucun statut. */
const makeEmptyPage = (url: string): CrawledPage => ({
  url,
  depth: 0,
  html: "",
  text: "",
  status: 0,
  robotsDenied: false,
});

/** Un crawl réduit à la seule page de départ, telle qu'on la lui donne. */
const crawlOf =
  (page: CrawledPage): CrawlSource =>
  () =>
    Promise.resolve({
      pages: [page],
      stopReason: "completed",
      truncated: false,
      visitedCount: 1,
      robotsDeniedCount: 0,
    });

/** Une recherche qui ne remonte qu'une source exploitable. */
const oneSource = (url: string): WebSearchProvider =>
  makeSearch([{ url, title: "Offres d'alternance", description: "Postes à pourvoir", host: url }]);

describe("runAgent - cascade de récupération", () => {
  it("extrait par les données structurées sans appeler le modèle", async () => {
    const fake = buildFakePrisma();
    const extract: ExtractJobs = () => {
      throw new Error("Le modèle ne doit pas être appelé quand l'extraction spécialisée trouve.");
    };
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract,
      specializedExtract: () => ({ offers: [makeOffer("Développeur", "Acme")], rejected: [] }),
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ extractedCount: 1, retainedCount: 1, errorCount: 0 });
    expect(fake.actions.find((action) => action.kind === "EXTRACT")?.detail).toContain(
      "specialized",
    );
  });

  it("escalade vers le modèle quand les données structurées ne trouvent rien", async () => {
    const fake = buildFakePrisma();
    const extract: ExtractJobs = () =>
      Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] });
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract,
      specializedExtract: () => ({ offers: [], rejected: [] }),
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ extractedCount: 1, errorCount: 0 });
    expect(fake.actions.find((action) => action.kind === "EXTRACT")?.detail).toContain("llm");
  });

  it("abandonne une page dont toutes les stratégies échouent, avec retried=true", async () => {
    const fake = buildFakePrisma();
    const extract: ExtractJobs = () => Promise.reject(new Error("modèle indisponible"));
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract,
      specializedExtract: () => {
        throw new Error("aucun JobPosting lisible");
      },
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ extractedCount: 0, retainedCount: 0, errorCount: 1 });
    expect(fake.errors[0]).toMatchObject({ kind: "EXTRACT", retried: true });
    expect(fake.runs.get("run-1")?.status).toBe("SUCCEEDED");
  });

  it("relit une page vide puis extrait la page relue", async () => {
    const fake = buildFakePrisma();
    const recovered = makePage("https://example.com/jobs");
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makeEmptyPage("https://example.com/jobs")),
      extract: () => Promise.reject(new Error("Le modèle ne doit pas servir ici.")),
      recoverPage: () => Promise.resolve(recovered),
      specializedExtract: () => ({ offers: [makeOffer("Développeur", "Acme")], rejected: [] }),
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ pageCount: 1, extractedCount: 1, errorCount: 0 });
    expect(fake.actions.map((action) => action.detail)).toContain(
      "https://example.com/jobs · relecture (read)",
    );
  });

  it("abandonne une page restée vide après relecture", async () => {
    const fake = buildFakePrisma();
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makeEmptyPage("https://example.com/jobs")),
      extract: () => Promise.reject(new Error("jamais appelé")),
      recoverPage: () => Promise.resolve(null),
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ extractedCount: 0, errorCount: 1 });
    expect(fake.errors[0]).toMatchObject({ kind: "CRAWL", retried: true });
  });

  it("borne le nombre de relectures sur le run", async () => {
    const fake = buildFakePrisma();
    const emptyCrawl: CrawlSource = () =>
      Promise.resolve({
        pages: [makeEmptyPage("https://example.com/a"), makeEmptyPage("https://example.com/b")],
        stopReason: "completed",
        truncated: false,
        visitedCount: 2,
        robotsDeniedCount: 0,
      });
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: emptyCrawl,
      extract: () => Promise.reject(new Error("jamais appelé")),
      recoverPage: () => Promise.resolve(null),
    });

    const result = await runAgent("alternance développeur", deps, {
      maxQueries: 1,
      maxRecoveries: 1,
    });

    // Une seule relecture tentée : la seconde page vide est abandonnée sans
    // nouvelle tentative, et le run reste borné.
    expect(result).toMatchObject({ pageCount: 2, errorCount: 1 });
  });

  it("rejette une borne de relecture invalide avant tout accès réseau", async () => {
    const fake = buildFakePrisma();
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await expect(
      runAgent("alternance", deps, { maxQueries: 1, maxRecoveries: -1 }),
    ).rejects.toThrow("maxRecoveries");
  });
});

// ---------------------------------------------------------------------------
// Porte déterministe avant le modèle (coût)
// ---------------------------------------------------------------------------

/** Une page sans aucun contrat du périmètre : un board d'entreprise en CDI. */
const makeOutOfScopePage = (url: string): CrawledPage => ({
  ...makePage(url),
  html: "<html><body>Senior Backend Engineer — CDI — Mexico</body></html>",
  text: "Senior Backend Engineer — CDI — Mexico",
});

describe("runAgent - porte déterministe", () => {
  it("n'appelle ni le modèle ni l'extraction spécialisée sur une page hors contrat", async () => {
    const fake = buildFakePrisma();
    let extractCalls = 0;
    let specializedCalls = 0;
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makeOutOfScopePage("https://example.com/jobs")),
      extract: () => {
        extractCalls += 1;
        return Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] });
      },
      specializedExtract: () => {
        specializedCalls += 1;
        return { offers: [], rejected: [] };
      },
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ extractedCount: 0, retainedCount: 0, errorCount: 0 });
    expect(extractCalls).toBe(0);
    expect(specializedCalls).toBe(0);
    expect(fake.actions.find((action) => action.kind === "EXTRACT")?.detail).toContain(
      "hors contrat",
    );
  });

  it("n'extrait pas une page servie en erreur", async () => {
    const fake = buildFakePrisma();
    let extractCalls = 0;
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf({ ...makePage("https://example.com/jobs"), status: 404 }),
      extract: () => {
        extractCalls += 1;
        return Promise.resolve({ offers: [], rejected: [] });
      },
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ extractedCount: 0, errorCount: 0 });
    expect(extractCalls).toBe(0);
    expect(fake.actions.find((action) => action.kind === "EXTRACT")?.detail).toContain(
      "statut 404",
    );
  });

  it("laisse passer une page quand l'appelant remplace la porte", async () => {
    const fake = buildFakePrisma();
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makeOutOfScopePage("https://example.com/jobs")),
      extract: () => Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] }),
      pageGate: () => true,
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(result).toMatchObject({ extractedCount: 1, errorCount: 0 });
  });

  it("traverse une racine de board ATS sans la prendre pour une offre", async () => {
    const fake = buildFakePrisma();
    let extractCalls = 0;
    const deps = buildDeps(fake, {
      search: oneSource("https://boards.greenhouse.io/acme"),
      crawl: crawlOf(makePage("https://boards.greenhouse.io/acme")),
      extract: () => {
        extractCalls += 1;
        return Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] });
      },
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    // La page nomme bien un contrat, mais c'est une liste de board : on ne
    // l'extrait pas, ses pages d'offre le seront.
    expect(result).toMatchObject({ extractedCount: 0, errorCount: 0 });
    expect(extractCalls).toBe(0);
    expect(fake.actions.find((action) => action.kind === "EXTRACT")?.detail).toContain("liste ATS");
  });

  it("ne crawle pas une source que le registre refuse", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    const search = makeSearch([
      {
        url: "https://fr.linkedin.com/jobs/alternance-emplois",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "fr.linkedin.com",
      },
      {
        url: "https://example.com/jobs",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      sourceGate: (url) =>
        Promise.resolve(
          url.includes("linkedin")
            ? { allowed: false, reason: "NO_CONNECTOR" }
            : { allowed: true, reason: "CAREER_SITE" },
        ),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1 });

    expect(crawled).toEqual(["https://example.com/jobs"]);
    const refusal = fake.actions.find(
      (action) => action.kind === "DISCOVER" && (action.detail ?? "").includes("source refusée"),
    );
    expect(refusal?.detail).toContain("NO_CONNECTOR");
  });
});

// ---------------------------------------------------------------------------
// Coût du modèle (CDC section 12)
// ---------------------------------------------------------------------------

/** Un modèle qui ne fait que rapporter l'usage accumulé par l'extraction. */
const usageReportingModel = (read: () => ModelUsage): ExtractModel => ({
  generateStructured: () => Promise.reject(new Error("Le modèle n'est pas appelé directement.")),
  usage: read,
});

describe("runAgent - coût du modèle", () => {
  it("attribue à l'action d'extraction le coût des tokens consommés", async () => {
    const fake = buildFakePrisma();
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const extract: ExtractJobs = () => {
      usage = {
        inputTokens: usage.inputTokens + 1000,
        outputTokens: usage.outputTokens + 500,
        calls: usage.calls + 1,
      };
      return Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] });
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract,
      model: usageReportingModel(() => usage),
      modelCost: (u) => u.inputTokens + 2 * u.outputTokens,
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    const action = fake.actions.find((a) => a.kind === "EXTRACT");
    expect(action?.costMicroUsd).toBe(2000);
    expect(action?.detail).toContain("1000+500 tok");
    expect(fake.runs.get("run-1")?.costMicroUsd).toBe(2000);
    expect(result).toMatchObject({ extractedCount: 1, errorCount: 0 });
  });

  it("trace les tokens sans inventer de coût quand le tarif manque", async () => {
    const fake = buildFakePrisma();
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const extract: ExtractJobs = () => {
      usage = { inputTokens: 700, outputTokens: 80, calls: 1 };
      return Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] });
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract,
      model: usageReportingModel(() => usage),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1 });

    const action = fake.actions.find((a) => a.kind === "EXTRACT");
    expect(action?.detail).toContain("700+80 tok");
    expect(action?.costMicroUsd).toBe(0);
  });

  it("compte aussi les tentatives refusées, qui ont été facturées", async () => {
    const fake = buildFakePrisma();
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const extract: ExtractJobs = () => {
      usage = {
        inputTokens: usage.inputTokens + 300,
        outputTokens: usage.outputTokens + 20,
        calls: usage.calls + 1,
      };
      return Promise.reject(new Error("modèle indisponible"));
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract,
      model: usageReportingModel(() => usage),
      modelCost: (u) => u.inputTokens + u.outputTokens,
      specializedExtract: () => {
        throw new Error("aucun JobPosting lisible");
      },
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    // Deux tentatives refusées : 600 tokens d'entrée et 40 de sortie.
    const action = fake.actions.find((a) => a.kind === "EXTRACT");
    expect(action?.detail).toContain("échec");
    expect(action?.costMicroUsd).toBe(640);
    expect(fake.runs.get("run-1")?.costMicroUsd).toBe(640);
    expect(result).toMatchObject({ extractedCount: 0, errorCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// Planificateur de recherches (section 5)
// ---------------------------------------------------------------------------

describe("runAgent - planificateur", () => {
  it("consigne le plan du modèle et lui attribue son coût", async () => {
    const fake = buildFakePrisma();
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const planner: QueryPlanner = {
      plan: () => {
        usage = { inputTokens: 400, outputTokens: 60, calls: 1 };
        return Promise.resolve({
          queries: [{ query: "alternance développeur", engine: "brave" }],
          source: "llm",
        });
      },
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract: () => Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] }),
      model: usageReportingModel(() => usage),
      modelCost: (u) => u.inputTokens + u.outputTokens,
      planner,
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1 });

    const discover = fake.actions.find((action) => action.kind === "DISCOVER");
    expect(discover?.detail).toContain("plan llm");
    expect(discover?.costMicroUsd).toBe(460);
    expect(fake.runs.get("run-1")?.costMicroUsd).toBe(460);
    expect(result).toMatchObject({ searchCount: 1, errorCount: 0 });
  });

  it("ne paie rien quand le plan reste déterministe", async () => {
    const fake = buildFakePrisma();
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await runAgent("alternance et stage développeur en Île-de-France", deps, { maxQueries: 3 });

    const discover = fake.actions.find((action) => action.kind === "DISCOVER");
    expect(discover?.detail).toContain("plan deterministic");
    expect(discover?.costMicroUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Boucle décision → outil → résultat → décision (section 5)
// ---------------------------------------------------------------------------

describe("runAgent - tours de planification", () => {
  it("rejoue un tour quand le planificateur le décide, observation en main", async () => {
    const fake = buildFakePrisma();
    const observations: PlannerObservation[] = [];
    let calls = 0;
    const planner: QueryPlanner = {
      plan: () =>
        Promise.resolve({ queries: [{ query: "tour 1", engine: "brave" }], source: "llm" }),
      refine: (context) => {
        observations.push(context.observation);
        calls += 1;
        return Promise.resolve(
          calls === 1 ? { queries: [{ query: "tour 2", engine: "brave" }], source: "llm" } : null,
        );
      },
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract: () => Promise.resolve({ offers: [makeOffer("Développeur", "Acme")], rejected: [] }),
      planner,
    });

    const result = await runAgent("alternance développeur", deps, {
      maxQueries: 1,
      maxPlanRounds: 2,
    });

    expect(
      fake.actions
        .filter((action) => action.kind === "DISCOVER" && (action.detail ?? "").startsWith("plan"))
        .map((action) => action.detail),
    ).toEqual(["plan llm · 1 requête(s)", "plan llm · 1 requête(s) · tour 2"]);
    expect(result.searchCount).toBe(2);

    // Le second tour a bien reçu le résultat du premier.
    expect(observations).toHaveLength(1);
    expect(observations[0]?.executedQueries).toEqual(["tour 1"]);
    expect(observations[0]?.pagesVisited).toBe(1);
    expect(observations[0]?.offers.map((offer) => offer.title)).toEqual(["Développeur"]);
    expect(observations[0]?.sources[0]).toMatchObject({ domain: "example.com", kept: true });
  });

  it("s'arrête au premier tour quand les tours sont bornés à un", async () => {
    const fake = buildFakePrisma();
    let refineCalls = 0;
    const planner: QueryPlanner = {
      plan: () =>
        Promise.resolve({ queries: [{ query: "tour 1", engine: "brave" }], source: "llm" }),
      refine: () => {
        refineCalls += 1;
        return Promise.resolve(null);
      },
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      planner,
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPlanRounds: 1 });

    expect(refineCalls).toBe(0);
    expect(
      fake.actions.filter(
        (action) => action.kind === "DISCOVER" && (action.detail ?? "").startsWith("plan"),
      ),
    ).toHaveLength(1);
  });

  it("s'arrête quand le planificateur ne propose plus rien", async () => {
    const fake = buildFakePrisma();
    let refineCalls = 0;
    const planner: QueryPlanner = {
      plan: () =>
        Promise.resolve({ queries: [{ query: "tour 1", engine: "brave" }], source: "llm" }),
      refine: () => {
        refineCalls += 1;
        return Promise.resolve(null);
      },
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/jobs"),
      crawl: crawlOf(makePage("https://example.com/jobs")),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      planner,
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPlanRounds: 3 });

    expect(refineCalls).toBe(1);
    expect(
      fake.actions.filter(
        (action) => action.kind === "DISCOVER" && (action.detail ?? "").startsWith("plan"),
      ),
    ).toHaveLength(1);
  });

  /** Une recherche qui rend une source différente à chaque requête. */
  const searchEchoing = (): WebSearchProvider => ({
    name: "doublure",
    search: (query) =>
      Promise.resolve([
        {
          url: `https://example.com/${encodeURIComponent(query.query)}`,
          title: "Offres d'alternance développeur",
          description: "Postes à pourvoir",
          host: "example.com",
        },
      ]),
    healthCheck: () => Promise.resolve({ healthy: true, detail: "La doublure répond." }),
  });

  /** Un crawl qui rend cinq pages d'un coup, pour éprouver le budget du tour. */
  const wideCrawl: CrawlSource = () =>
    Promise.resolve({
      pages: [1, 2, 3, 4, 5].map((index) => makePage(`https://example.com/page-${String(index)}`)),
      stopReason: "completed",
      truncated: false,
      visitedCount: 5,
      robotsDeniedCount: 0,
    });

  it("réserve une part du budget de pages à chaque tour", async () => {
    const fake = buildFakePrisma();
    let refineCalls = 0;
    const planner: QueryPlanner = {
      plan: () =>
        Promise.resolve({ queries: [{ query: "tour 1", engine: "brave" }], source: "llm" }),
      refine: () => {
        refineCalls += 1;
        return Promise.resolve({
          queries: [{ query: `tour ${String(refineCalls + 1)}`, engine: "brave" }],
          source: "llm",
        });
      },
    };

    const deps = buildDeps(fake, {
      search: searchEchoing(),
      crawl: wideCrawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      planner,
    });

    const result = await runAgent("alternance développeur", deps, {
      maxQueries: 1,
      maxPages: 6,
      maxPlanRounds: 3,
    });

    // 6 pages = 3 tours × 2 pages, mais la doublure rend toujours les cinq mêmes
    // pages : les doublons d'un tour à l'autre ne sont plus comptés, d'où 5 pages
    // distinctes. Chaque tour garde bien de quoi en faire un autre.
    expect(result.pageCount).toBe(5);
    expect(refineCalls).toBe(2);
    expect(
      fake.actions
        .filter((action) => action.kind === "DISCOVER" && (action.detail ?? "").startsWith("plan"))
        .map((action) => action.detail),
    ).toEqual([
      "plan llm · 1 requête(s)",
      "plan llm · 1 requête(s) · tour 2",
      "plan llm · 1 requête(s) · tour 3",
    ]);
  });

  it("laisse tout le budget à un planificateur qui ne révise pas", async () => {
    const fake = buildFakePrisma();
    const deps = buildDeps(fake, {
      search: searchEchoing(),
      crawl: wideCrawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    const result = await runAgent("alternance et stage développeur en Île-de-France", deps, {
      maxQueries: 1,
      maxPages: 6,
    });

    // Un seul tour : les cinq pages de la source passent, comme avant.
    expect(result.pageCount).toBe(5);
    expect(
      fake.actions.filter(
        (action) => action.kind === "DISCOVER" && (action.detail ?? "").startsWith("plan"),
      ),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Choix des sources (section 5)
// ---------------------------------------------------------------------------

describe("runAgent - choix des sources", () => {
  it("crawle les sources dans l'ordre choisi, pas celui du score", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    const search = makeSearch([
      {
        url: "https://example.com/premiere",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
      {
        url: "https://example.com/seconde",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);
    const selector: SourceSelector = {
      select: ({ candidates }) =>
        Promise.resolve({
          urls: [...candidates].reverse().map((candidate) => candidate.url),
          source: "llm",
        }),
    };

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      sourceSelector: selector,
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    // Le modèle a renversé l'ordre : la seconde source passe d'abord.
    expect(crawled).toEqual(["https://example.com/seconde", "https://example.com/premiere"]);
    const selection = fake.actions.find((action) => (action.detail ?? "").startsWith("sélection"));
    expect(selection?.detail).toBe("sélection llm · 2 source(s) sur 2");
  });

  it("suit l'ordre du score sans sélecteur", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    const search = makeSearch([
      {
        url: "https://example.com/premiere",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
      {
        url: "https://example.com/seconde",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(crawled).toEqual(["https://example.com/premiere", "https://example.com/seconde"]);
    expect(
      fake.actions.find((action) => (action.detail ?? "").startsWith("sélection"))?.detail,
    ).toContain("sélection score");
  });

  it("ne crawle pas deux fois la même page sous deux variantes d'URL", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    // Le moteur rend la même page avec un paramètre de suivi, puis sans : mesuré
    // sur un run réel, ces variantes faisaient crawler trois fois la même page.
    const search = makeSearch([
      {
        url: "https://example.com/offres?utm_source=brave",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
      {
        url: "https://example.com/offres",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(crawled).toEqual(["https://example.com/offres?utm_source=brave"]);
    expect(result.pageCount).toBe(1);
  });

  it("ne re-crawle pas une page déjà atteinte sous un autre chemin (alias de redirection)", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    // Mesuré sur Ivalua : /carrieres et /company/careers mènent à la même page.
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      const finalUrl = options.startUrl.includes("carrieres")
        ? "https://example.com/company/careers/"
        : options.startUrl;
      return Promise.resolve({ ...successCrawl(options.startUrl), pages: [makePage(finalUrl)] });
    };
    const search = makeSearch([
      {
        url: "https://example.com/carrieres",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
      {
        url: "https://example.com/company/careers/",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    // La seconde source pointe sur l'URL finale déjà atteinte : pas de second crawl.
    expect(crawled).toEqual(["https://example.com/carrieres"]);
    expect(result.pageCount).toBe(1);
  });

  it("ne confond pas deux pages distinguées par leur requête", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    // Contre-exemple trouvé en revue : la pagination par requête est suivie par
    // le crawler du dépôt. Si la clé de mémoire effaçait la requête, la page 2
    // serait sautée et ses offres perdues — définitivement, la mémoire étant
    // persistante et sans expiration.
    const search = makeSearch([
      {
        url: "https://example.com/offres?page=1",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
      {
        url: "https://example.com/offres?page=2",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(crawled).toEqual([
      "https://example.com/offres?page=1",
      "https://example.com/offres?page=2",
    ]);
  });

  it("ne mémorise pas une page lue mais hors budget", async () => {
    const fake = buildFakePrisma();
    const crawl: CrawlSource = (options) =>
      Promise.resolve({
        ...successCrawl(options.startUrl),
        pages: [makePage("https://example.com/une"), makePage("https://example.com/deux")],
      });

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/offres"),
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 1 });

    // La première est dans le budget, la seconde non : elle ne doit pas être
    // inscrite comme visitée, sinon ses offres seraient sautées à jamais.
    expect(fake.memories.has("VISITED_URL:example.com/une")).toBe(true);
    expect(fake.memories.has("VISITED_URL:example.com/deux")).toBe(false);
  });

  it("ne paie pas deux fois la même page rendue sous deux écritures dans un crawl", async () => {
    const fake = buildFakePrisma();
    // Mesuré sur un run réel : `/board` et `/board?` sortaient du même crawl et
    // étaient comptées et extraites toutes les deux.
    const crawl: CrawlSource = (options) =>
      Promise.resolve({
        ...successCrawl(options.startUrl),
        pages: [makePage("https://example.com/board"), makePage("https://example.com/board?")],
      });
    let extractCalls = 0;
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/offres"),
      crawl,
      extract: () => {
        extractCalls += 1;
        return Promise.resolve({ offers: [], rejected: [] });
      },
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(result.pageCount).toBe(1);
    expect(extractCalls).toBe(1);
  });

  it("ne re-extrait pas une page déjà visitée par un run antérieur", async () => {
    const fake = buildFakePrisma();
    // La mémoire est persistante : une page traitée par un run précédent ne doit
    // pas être repayée, même si le crawler la rend de nouveau.
    fake.memories.set("VISITED_URL:example.com/deja-vue", {
      kind: "VISITED_URL",
      key: "example.com/deja-vue",
      value: null,
    });
    let extractCalls = 0;
    const crawl: CrawlSource = (options) =>
      Promise.resolve({
        ...successCrawl(options.startUrl),
        pages: [makePage(options.startUrl), makePage("https://example.com/deja-vue")],
      });

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/offres"),
      crawl,
      extract: () => {
        extractCalls += 1;
        return Promise.resolve({ offers: [], rejected: [] });
      },
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(result.pageCount).toBe(1);
    expect(extractCalls).toBe(1);
  });

  it("borne le crawl par ce qui reste au tour", async () => {
    const fake = buildFakePrisma();
    const requested: number[] = [];
    const crawl: CrawlSource = (options) => {
      requested.push(options.maxPages);
      return Promise.resolve(successCrawl(options.startUrl));
    };

    // Un planificateur qui révise : 6 pages réparties sur 3 tours au plus, donc
    // 2 pour ce tour — et le crawler le sait, il ne lit pas 20 pages pour rien.
    const revisingPlanner: QueryPlanner = {
      ...deterministicQueryPlanner,
      refine: () => Promise.resolve(null),
    };
    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/premiere"),
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      planner: revisingPlanner,
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 6 });

    expect(requested[0]).toBe(2);
  });

  it("laisse tout le budget au crawler quand il n'y a pas de tour suivant", async () => {
    const fake = buildFakePrisma();
    const requested: number[] = [];
    const crawl: CrawlSource = (options) => {
      requested.push(options.maxPages);
      return Promise.resolve(successCrawl(options.startUrl));
    };

    const deps = buildDeps(fake, {
      search: oneSource("https://example.com/premiere"),
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 6 });

    expect(requested[0]).toBe(6);
  });

  it("paie encore un alias découvert APRÈS la page finale, faute de résolution", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    // Ivalua, sens inverse du test précédent : la page finale passe d'abord, puis
    // l'alias. Rien ne relie encore les deux adresses avant de les avoir crawlé
    // l'une et l'autre, donc les deux sont payées. Le corriger demanderait de
    // résoudre la redirection avant de crawler.
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    const search = makeSearch([
      {
        url: "https://example.com/company/careers/",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
      {
        url: "https://example.com/carrieres",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(crawled).toEqual([
      "https://example.com/company/careers/",
      "https://example.com/carrieres",
    ]);
  });

  it("reconnaît un alias de redirection AVANT de le payer quand la résolution est branchée", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    // Même situation que le test précédent, mais le worker branche `resolveUrl`
    // (`resolveFinalUrl` du crawler) : l'alias est reconnu avant le crawl.
    const search = makeSearch([
      {
        url: "https://example.com/company/careers/",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
      {
        url: "https://example.com/carrieres",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      resolveUrl: (url) =>
        Promise.resolve(url.includes("carrieres") ? "https://example.com/company/careers/" : null),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(crawled).toEqual(["https://example.com/company/careers/"]);
  });

  it("écarte une page que la source elle-même annonce en erreur", async () => {
    const fake = buildFakePrisma();
    const crawled: string[] = [];
    const crawl: CrawlSource = (options) => {
      crawled.push(options.startUrl);
      return Promise.resolve(successCrawl(options.startUrl));
    };
    // Mesuré sur trois runs : les boards Greenhouse reviennent en `?error=true`
    // (offre supprimée) et consommaient résolution et crawl pour rien.
    const search = makeSearch([
      {
        url: "https://job-boards.greenhouse.io/mirakllabs?error=true",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "job-boards.greenhouse.io",
      },
      {
        url: "https://example.com/offres",
        title: "Offres d'alternance développeur",
        description: "Postes à pourvoir",
        host: "example.com",
      },
    ]);

    const deps = buildDeps(fake, {
      search,
      crawl,
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(crawled).toEqual(["https://example.com/offres"]);
    const selection = fake.actions.find((action) => (action.detail ?? "").startsWith("sélection"));
    expect(selection?.detail).toContain("1 page(s) en erreur écartée(s)");
  });
});

// ---------------------------------------------------------------------------
// Enregistrement des sources découvertes (registre CompanySource)
// ---------------------------------------------------------------------------

describe("runAgent - enregistrement des sources découvertes", () => {
  it("enregistre une source retenue et consigne la phrase rendue", async () => {
    const fake = buildFakePrisma();
    const registered: string[] = [];
    const url = "https://boards.greenhouse.io/acme/jobs/4606134004";
    const deps = buildDeps(fake, {
      search: oneSource(url),
      crawl: crawlOf(makePage(url)),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      discoverSource: (candidate) => {
        registered.push(candidate);
        return Promise.resolve("acme · connecteur greenhouse");
      },
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(registered).toEqual([url]);
    const enregistrement = fake.actions.find(
      (action) => action.kind === "DISCOVER" && (action.detail ?? "").startsWith("source · "),
    );
    expect(enregistrement?.detail).toBe("source · acme · connecteur greenhouse");

    // L'enregistrement précède la sélection : il ne dépend pas du choix de crawl.
    const details = fake.actions.map((action) => action.detail ?? "");
    const registeredAt = details.findIndex((detail) => detail.startsWith("source · "));
    const selectionAt = details.findIndex((detail) => detail.startsWith("sélection"));
    expect(registeredAt).toBeGreaterThanOrEqual(0);
    expect(registeredAt).toBeLessThan(selectionAt);
  });

  it("n'enregistre pas une source écartée par le scoring", async () => {
    const fake = buildFakePrisma();
    const registered: string[] = [];
    const search = makeSearch([
      {
        url: "https://jobs.lever.co/theodo/19acaa5d-159c-4ca9-a39c-f5a2ed5ffcd5",
        title: "Développeur",
        description: "Alternance",
        host: "jobs.lever.co",
      },
      {
        url: "https://openclassrooms.com/formations",
        title: "Formation développeur web",
        description: "Formation en alternance",
        host: "openclassrooms.com",
      },
    ]);
    const deps = buildDeps(fake, {
      search,
      crawl: (options) => Promise.resolve(successCrawl(options.startUrl)),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      discoverSource: (candidate) => {
        registered.push(candidate);
        return Promise.resolve("enregistrée");
      },
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(registered).toEqual([
      "https://jobs.lever.co/theodo/19acaa5d-159c-4ca9-a39c-f5a2ed5ffcd5",
    ]);
  });

  it("consigne l'échec d'enregistrement sans casser le run", async () => {
    const fake = buildFakePrisma();
    const url = "https://boards.greenhouse.io/acme/jobs/4606134004";
    const deps = buildDeps(fake, {
      search: oneSource(url),
      crawl: crawlOf(makePage(url)),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      discoverSource: () => Promise.reject(new Error("registre indisponible")),
    });

    const result = await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(result.status).toBe("SUCCEEDED");
    // Le crawl a bien eu lieu malgré l'échec du registre.
    expect(result.sourceCount).toBe(1);
    expect(fake.errors).toHaveLength(1);
    expect(fake.errors[0]).toMatchObject({
      kind: "DISCOVER",
      message: "registre indisponible",
    });
    expect(fake.actions.some((action) => (action.detail ?? "").startsWith("source · "))).toBe(
      false,
    );
  });

  it("n'enregistre qu'une fois la même URL dans le run", async () => {
    const fake = buildFakePrisma();
    const registered: string[] = [];
    const url = "https://boards.greenhouse.io/acme/jobs/4606134004";
    const search = makeSearch([
      {
        url,
        title: "Développeur full stack",
        description: "Alternance",
        host: "boards.greenhouse.io",
      },
      {
        url,
        title: "Développeur full stack",
        description: "Alternance",
        host: "boards.greenhouse.io",
      },
    ]);
    const deps = buildDeps(fake, {
      search,
      crawl: (options) => Promise.resolve(successCrawl(options.startUrl)),
      extract: () => Promise.resolve({ offers: [], rejected: [] }),
      discoverSource: (candidate) => {
        registered.push(candidate);
        return Promise.resolve("acme · connecteur greenhouse");
      },
    });

    await runAgent("alternance développeur", deps, { maxQueries: 1, maxPages: 4 });

    expect(registered).toEqual([url]);
    expect(
      fake.actions.filter(
        (action) => action.kind === "DISCOVER" && (action.detail ?? "").startsWith("source · "),
      ),
    ).toHaveLength(1);
  });
});
