import { createAgentMemoryStore, createAgentRunStore } from "@findit/agent";
import type { CrawlResult, CrawledPage } from "@findit/crawler";
import type { ExtractModel, JobOffer } from "@findit/extract";
import type {
  WebSearchProvider,
  WebSearchProviderHealth,
  WebSearchResult,
} from "@findit/job-connectors";
import { describe, expect, it } from "vitest";

import { runAgent } from "./run-agent.js";
import type { CrawlSource, ExtractJobs } from "./run-agent.js";

/** Une offre minimale et valide (titre, entreprise, URL de candidature). */
const makeOffer = (title: string, company: string): JobOffer => ({
  title,
  company,
  technologies: [],
  applicationUrl: `https://example.com/postes/${encodeURIComponent(title)}`,
  sourceUrl: "https://example.com/jobs",
  sourceDomain: "example.com",
});

/** Une page crawlée lisible, avec un texte simple. */
const makePage = (url: string): CrawledPage => ({
  url,
  depth: 0,
  html: "<html><body>offre</body></html>",
  text: "offre",
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

    // L'enchaînement : recherche, puis crawl et extraction par source, puis
    // déduplication du doublon, puis stockage du compte.
    expect(fake.actions.map((action) => action.kind)).toEqual([
      "SEARCH",
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

    // Les compteurs du run, tenus par le run-store.
    const run = fake.runs.get("run-1");
    expect(run?.status).toBe("SUCCEEDED");
    expect(run?.counters).toMatchObject({
      searches: 1,
      pages: 2,
      extracted: 2,
      duplicates: 1,
      inserted: 1,
      errors: 0,
    });

    // La source école est notée sous le seuil : elle n'est pas crawlée.
    expect(fake.memories.has("VISITED_URL:https://ecole-informatique.fr/formations")).toBe(false);
    // Les deux sources gardées ont été mémorisées après leur crawl.
    expect(fake.memories.has("VISITED_URL:https://boards.greenhouse.io/acme/jobs")).toBe(true);
    expect(fake.memories.has("VISITED_URL:https://example.com/jobs")).toBe(true);
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
