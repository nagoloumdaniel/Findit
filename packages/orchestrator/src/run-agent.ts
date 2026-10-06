import {
  ACTION_KIND,
  AGENT_RUN_STATUS,
  MEMORY_KIND,
  isAtsBoardListing,
  scoreSources,
} from "@findit/agent";
import type {
  AgentMemoryStore,
  AgentRunStore,
  GeneratedSearchQuery,
  SourceResult,
  TerminalRunStatus,
} from "@findit/agent";
import type { CrawlOptions, CrawlResult, CrawledPage } from "@findit/crawler";
import {
  extractJobsFromPage,
  extractStructuredOffers,
  mentionsPerimeterContract,
} from "@findit/extract";
import type { ExtractModel, ExtractionResult, ModelUsage } from "@findit/extract";
import type { WebSearchProvider, WebSearchQuery, WebSearchResult } from "@findit/job-connectors";

import { resolveOptions } from "./config.js";
import type { ResolvedOptions, RunAgentOptions } from "./config.js";
import { isValidOffer, normalizeTitle } from "./dedup.js";
import { deterministicQueryPlanner } from "./planner.js";
import type { ObservedSource, QueryPlanner } from "./planner.js";
import { RECOVERY_STRATEGY, runRecovery } from "./recovery.js";
import { scoreOrderSelector } from "./selector.js";
import type { SourceCandidate, SourceSelection, SourceSelector } from "./selector.js";

/** Une source à crawler : l'URL de départ et ses bornes, confiées au crawler. */
export type CrawlSource = (options: CrawlOptions) => Promise<CrawlResult>;

/** Extraction d'une page, du même contrat que `extractJobsFromPage`. */
export type ExtractJobs = (page: CrawledPage, model: ExtractModel) => Promise<ExtractionResult>;

/** Persistance des offres retenues. Défaut : le compte est consigné sans écrire. */
export type PersistJobs = (offers: readonly ExtractionResult["offers"][number][]) => Promise<{
  readonly inserted: number;
  readonly duplicates: number;
  readonly rejected: readonly { readonly title: string; readonly reason: string }[];
}>;

/**
 * Dépendances du run : les briques déjà construites, injectées pour que la
 * boucle soit vérifiable avec des doubles. Aucune n'est fabriquée ici.
 */
export interface RunAgentDeps {
  readonly runStore: AgentRunStore;
  readonly memoryStore: AgentMemoryStore;
  readonly search: WebSearchProvider;
  readonly crawl: CrawlSource;
  readonly model: ExtractModel;
  /** Extraction. Défaut : `extractJobsFromPage`. */
  readonly extract?: ExtractJobs;
  /**
   * Extraction spécialisée, déterministe et gratuite, tentée avant le modèle.
   * Défaut : les données structurées `schema.org JobPosting`.
   */
  readonly specializedExtract?: (page: CrawledPage) => ExtractionResult;
  /**
   * Relecture d'une page revenue vide. La fonction injectée refait la lecture ;
   * côté crawler, elle y applique HTTP puis navigateur et revérifie
   * `robots.txt`. Sans elle, une page vide est ignorée comme avant.
   */
  readonly recoverPage?: (url: string) => Promise<CrawledPage | null>;
  /**
   * Porte déterministe avant l'extraction : quand elle rend `false`, le modèle
   * n'est pas appelé du tout. Défaut : la page doit nommer un contrat du
   * périmètre (`mentionsPerimeterContract`).
   */
  readonly pageGate?: (page: CrawledPage) => boolean;
  /**
   * Traduit un usage de modèle en micro-dollars. Absent, le coût reste à zéro
   * alors que les tokens restent tracés dans le détail de l'action : sans tarif
   * connu, on ne préfère pas inventer un prix.
   */
  readonly modelCost?: (usage: ModelUsage) => number;
  /**
   * Planificateur des recherches. Défaut : le plan déterministe, déduit de
   * l'objectif par règles. Un planificateur piloté par le modèle (section 5 du
   * cahier des charges) se branche ici, et retombe sur le déterministe en cas
   * d'échec.
   */
  readonly planner?: QueryPlanner;
  /**
   * Porte d'accès d'une source découverte, consultée avant de la crawler. Le
   * registre de conformité est la seule autorité : l'appelant la branche
   * (`decideDiscoveredSourceAccess`). Défaut : aucune porte, toute source gardée
   * est visitée.
   */
  readonly sourceGate?: (
    url: string,
  ) => Promise<{ readonly allowed: boolean; readonly reason: string }>;
  /**
   * Choix des sources à crawler parmi celles que le scoring a retenues. Défaut :
   * l'ordre du score, tronqué au budget de pages. Un sélecteur piloté par le
   * modèle (section 5) se branche ici.
   */
  readonly sourceSelector?: SourceSelector;
  /**
   * Résout l'URL finale d'une source sans lire la page (`resolveFinalUrl` du
   * crawler). Sert à reconnaître un alias de redirection AVANT de le payer :
   * mesuré, `/carrieres` et `/company/careers` mènent à la même page. Sans cette
   * porte, seule l'adresse déjà vue est reconnue. Défaut : aucune résolution.
   */
  readonly resolveUrl?: (url: string) => Promise<string | null>;
  /**
   * Enregistre une source découverte auprès du registre (`CompanySource`) pour
   * que son connecteur la recollecte. Rend une phrase à journaliser, ou `null`
   * quand l'URL n'est pas une source enregistrable. Défaut : rien n'est enregistré.
   */
  readonly discoverSource?: (url: string) => Promise<string | null>;
  /** Persistance. Défaut : aucune, le compte STORE est simplement consigné. */
  readonly persist?: PersistJobs;
}

/** Compteurs du run, renvoyés à l'appelant pour le rapport. */
export interface RunAgentResult {
  readonly runId: string;
  readonly status: TerminalRunStatus;
  /** Requêtes de recherche exécutées avec succès. */
  readonly searchCount: number;
  /** Sources crawlées sans erreur. */
  readonly sourceCount: number;
  /** Pages visitées et comptées dans la borne. */
  readonly pageCount: number;
  /** Offres rendues par l'extraction, avant déduplication. */
  readonly extractedCount: number;
  /** Offres retenues après validation et déduplication. */
  readonly retainedCount: number;
  /** Erreurs consignées pendant le run. */
  readonly errorCount: number;
}

/** Compteurs internes, alimentés au fil de la boucle. */
interface RunCounters {
  searchCount: number;
  sourceCount: number;
  pageCount: number;
  extractedCount: number;
  retainedCount: number;
  errorCount: number;
}

/**
 * Clé d'identité d'une URL pour la mémoire. Le POURQUOI : une même page revient
 * du moteur avec des variantes (`/` final, paramètre de suivi) ; mesuré, la même
 * page a été crawlée aux trois tours d'un run parce que les chaînes différaient.
 *
 * La requête est **conservée** hors paramètres de suivi : elle porte souvent
 * l'identité de la page (`?page=2`, `?gh_jid=...`), et l'effacer ferait sauter des
 * pages légitimes. Le fragment, lui, est retiré — le crawler le retire aussi avant
 * de demander la page, donc deux fragments mènent à la même réponse serveur.
 */
const TRACKING_PARAMS: readonly RegExp[] = [
  /^utm_/u,
  /^gclid$/u,
  /^fbclid$/u,
  /^msclkid$/u,
  /^lever-source$/u,
];

const crawlKey = (url: string): string => {
  try {
    const parsed = new URL(url);
    for (const name of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(name))) {
        parsed.searchParams.delete(name);
      }
    }
    parsed.hash = "";
    parsed.searchParams.sort();
    const query = parsed.searchParams.toString();
    const path = parsed.pathname.replace(/\/+$/u, "");
    const host = parsed.hostname.replace(/^www\./u, "").toLowerCase();
    const port = parsed.port === "" ? "" : `:${parsed.port}`;
    return `${host}${port}${path}${query === "" ? "" : `?${query}`}`;
  } catch {
    // URL illisible : on la garde telle quelle plutôt que de risquer une collision.
    return url.trim();
  }
};

/**
 * Vrai pour une URL que la source annonce elle-même en erreur.
 *
 * Le POURQUOI : mesuré sur trois runs, les boards Greenhouse reviennent du moteur
 * sous la forme `?error=true` (offre supprimée ou expirée). Ces pages consommaient
 * une résolution de redirection et un crawl sans jamais porter d'offre. Le signal
 * est écrit par la source, pas deviné : on ne filtre que `error=true` et `error=1`.
 */
const ERROR_PAGE_PATTERN = /[?&]error=(?:true|1)(?:&|$)/iu;

const isErrorPageUrl = (url: string): boolean => {
  try {
    return ERROR_PAGE_PATTERN.test(new URL(url).search);
  } catch {
    return ERROR_PAGE_PATTERN.test(url);
  }
};

/**
 * Nombre de candidates envoyées au sélecteur. Mesuré : lui donner les 29 sources
 * d'un tour coûtait 1 012 µ$ pour la seule sélection, soit 90 % du run ; le score
 * a déjà classé les sources, le modèle n'a besoin que du haut de la liste pour
 * choisir et ordonner.
 */
const MAX_SELECTION_CANDIDATES = 12;

/** Hôte de l'URL (sans port), ou vide quand l'URL n'est pas analysable. */
const sourceDomainOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    // URL illisible : aucun domaine exploitable pour le scoring.
    return "";
  }
};

/** Traduit un résultat de moteur en source à noter par `scoreSources`. */
const toSourceResult = (result: WebSearchResult): SourceResult => ({
  domain: sourceDomainOf(result.url),
  url: result.url,
  title: result.title,
  description: result.description,
});

/** Construit la requête moteur à partir d'une requête générée. */
const toSearchQuery = (
  generated: GeneratedSearchQuery,
  options: ResolvedOptions,
): WebSearchQuery => ({
  query: generated.query,
  country: options.country,
  language: options.language,
  count: options.resultCount,
});

/** Rend le message d'une erreur inconnue, sans jamais inventer de détail. */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Erreur inconnue.";

/**
 * Différence entre deux relevés d'usage, ou `null` quand le client ne rapporte
 * rien. Un relevé négatif (client remplacé) est ramené à zéro plutôt que de
 * produire un coût négatif.
 */
const usageDelta = (
  before: ModelUsage | undefined,
  after: ModelUsage | undefined,
): ModelUsage | null => {
  if (before === undefined || after === undefined) {
    return null;
  }
  return {
    inputTokens: Math.max(0, after.inputTokens - before.inputTokens),
    outputTokens: Math.max(0, after.outputTokens - before.outputTokens),
    calls: Math.max(0, after.calls - before.calls),
  };
};

/** Rappel des tokens consommés, ajouté au détail d'une action d'extraction. */
const usageSuffix = (usage: ModelUsage | null): string =>
  usage === null ? "" : ` · ${String(usage.inputTokens)}+${String(usage.outputTokens)} tok`;

/**
 * Construit les options de crawl d'une source. Le crawler reçoit le temps qui
 * reste au run **et** ce qui reste du budget de pages du tour : sans cela, il
 * pouvait lire jusqu'à `maxPagesPerSource` pages pour un tour qui n'en compterait
 * qu'une, et le surplus était jeté.
 */
const crawlOptionsFor = (
  startUrl: string,
  options: ResolvedOptions,
  deadline: number,
  remainingRoundPages: number,
): CrawlOptions => ({
  startUrl,
  maxDepth: options.maxDepth,
  maxPages: Math.max(1, Math.min(options.maxPagesPerSource, remainingRoundPages)),
  maxRuntimeMs: Math.max(1, deadline - options.now()),
});

/**
 * Exécute la boucle complète de l'agent pour un objectif : rechercher, noter,
 * crawler, extraire, valider, dédupliquer et stocker. Une étape qui échoue est
 * consignée et le run continue sur le reste ; une borne de pages ou de temps
 * atteinte arrête la boucle sans la faire échouer.
 */
export async function runAgent(
  objective: string,
  deps: RunAgentDeps,
  options: RunAgentOptions = {},
): Promise<RunAgentResult> {
  const config = resolveOptions(options);
  const extract = deps.extract ?? extractJobsFromPage;
  const specializedExtract = deps.specializedExtract ?? extractStructuredOffers;
  /*
   * Porte par défaut : la page doit nommer un contrat du périmètre, **et** ne pas
   * être la racine d'un board d'ATS. Un board liste tous les contrats d'une
   * entreprise ; on le traverse pour trouver ses pages d'offre, on ne le prend
   * pas pour une offre. Mesuré : sans cela, un board faisait extraire tout son
   * contenu, majoritairement hors périmètre, aux frais du modèle.
   */
  const pageGate =
    deps.pageGate ??
    ((page: CrawledPage): boolean =>
      mentionsPerimeterContract(page) && !isAtsBoardListing(page.url));

  const runId = await deps.runStore.startRun(objective);
  const deadline = config.now() + config.maxRuntimeMs;

  const counters: RunCounters = {
    searchCount: 0,
    sourceCount: 0,
    pageCount: 0,
    extractedCount: 0,
    retainedCount: 0,
    errorCount: 0,
  };

  /** Relectures de pages vides déjà consommées, bornées par `maxRecoveries`. */
  let recoveriesUsed = 0;

  const isTimedOut = (): boolean => config.now() >= deadline;
  const shouldStop = (): boolean => isTimedOut() || counters.pageCount >= config.maxPages;

  const recordError = async (kind: string, message: string, retried = false): Promise<void> => {
    counters.errorCount += 1;
    await deps.runStore.recordError(runId, { kind, message, retried });
  };

  const seenTitles = new Set<string>();
  const retainedOffers: ExtractionResult["offers"][number][] = [];

  try {
    /*
     * Boucle de décision (section 5) : le modèle choisit les recherches, puis
     * voit ce que le tour a produit et décide s'il en faut un autre. Tout est
     * borné : `maxQueries` par tour, `maxPlanRounds` pour le nombre de tours, et
     * les bornes de pages ou de temps arrêtent la boucle comme le reste du run.
     */
    const planner = deps.planner ?? deterministicQueryPlanner;
    const selector = deps.sourceSelector ?? scoreOrderSelector;
    const observedSources: ObservedSource[] = [];
    const executedQueries: string[] = [];
    /** Clés des sources déjà crawlées dans ce run, variantes d'URL comprises. */
    const crawledKeys = new Set<string>();
    /** URL de sources déjà présentées au registre, une fois par run. */
    const discoveredUrls = new Set<string>();
    let round = 0;

    /** Pages autorisées pour le tour en cours, recalculée à chaque tour. */
    let roundPageLimit = config.maxPages;
    const roundExhausted = (): boolean => counters.pageCount >= roundPageLimit;

    let planUsageBefore = deps.model.usage?.();
    let current = await planner.plan({ objective, maxQueries: config.maxQueries });
    let planUsage = usageDelta(planUsageBefore, deps.model.usage?.());

    for (;;) {
      /*
       * Budget de pages du tour. Sans lui, un premier tour productif consommait
       * tout le run et `refine` n'était jamais appelé — mesuré : 8 pages prises
       * par le premier tour, un seul tour exécuté. Chaque tour reçoit donc une
       * part, et le dernier dispose de ce qui reste. Un planificateur sans
       * `refine` garde tout le budget : il n'y a pas de tour suivant.
       */
      const perRound =
        planner.refine === undefined
          ? config.maxPages
          : Math.max(1, Math.ceil(config.maxPages / config.maxPlanRounds));
      roundPageLimit = Math.min(config.maxPages, counters.pageCount + perRound);

      await deps.runStore.recordAction(runId, {
        kind: ACTION_KIND.DISCOVER,
        detail: `plan ${current.source} · ${String(current.queries.length)} requête(s)${
          round === 0 ? "" : ` · tour ${String(round + 1)}`
        }`,
        count: current.queries.length,
        costMicroUsd:
          planUsage !== null && deps.modelCost !== undefined ? deps.modelCost(planUsage) : 0,
      });

      /*
       * Phase 1 : recherche et scoring. On rassemble les candidates du tour sans
       * rien crawler : le choix vient après, une fois toutes les sources notées
       * connues.
       */
      const candidatesByUrl = new Map<string, SourceCandidate>();
      let errorPagesSkipped = 0;
      for (const query of current.queries) {
        if (shouldStop() || roundExhausted()) {
          break;
        }
        executedQueries.push(query.query);

        // Recherche web : un échec est consigné, la requête suivante continue.
        let results: readonly WebSearchResult[];
        try {
          results = await deps.search.search(toSearchQuery(query, config));
        } catch (error) {
          await recordError(ACTION_KIND.SEARCH, errorMessage(error));
          continue;
        }
        counters.searchCount += 1;
        await deps.runStore.recordAction(runId, {
          kind: ACTION_KIND.SEARCH,
          detail: query.query,
        });

        // Scoring : on ne garde que les sources au-dessus du seuil.
        const scored = scoreSources(results.map(toSourceResult), {
          threshold: config.scoreThreshold,
        });

        for (const source of scored) {
          observedSources.push({
            url: source.result.url,
            domain: source.result.domain,
            score: source.score,
            kept: source.keep,
          });

          if (isErrorPageUrl(source.result.url)) {
            errorPagesSkipped += 1;
            continue;
          }

          if (source.keep && !candidatesByUrl.has(source.result.url)) {
            candidatesByUrl.set(source.result.url, {
              url: source.result.url,
              domain: source.result.domain,
              score: source.score,
              title: `${source.result.title} ${source.result.description}`.trim(),
            });
          }

          /*
           * Enregistrement de la source découverte (phase 1). Le POURQUOI : une
           * entreprise trouvée sur un ATS doit entrer au registre pour que son
           * connecteur la recollecte aux cycles suivants ; sans cela, la
           * découverte du run est jetée avec le run. On le fait ici, et non après
           * la sélection : la sélection est un choix de crawl, une source retenue
           * par le scoring mais écartée du crawl doit tout de même être
           * enregistrée. Une URL n'est présentée qu'une fois par run, une page
           * annoncée en erreur a déjà été écartée plus haut, et une source déjà
           * crawlée n'a rien de neuf à enregistrer.
           */
          if (
            source.keep &&
            deps.discoverSource !== undefined &&
            !discoveredUrls.has(source.result.url) &&
            !crawledKeys.has(crawlKey(source.result.url))
          ) {
            discoveredUrls.add(source.result.url);
            try {
              const phrase = await deps.discoverSource(source.result.url);
              if (phrase !== null) {
                await deps.runStore.recordAction(runId, {
                  kind: ACTION_KIND.DISCOVER,
                  detail: `source · ${phrase}`,
                });
              }
            } catch (error) {
              await recordError(ACTION_KIND.DISCOVER, errorMessage(error));
            }
          }
        }
      }

      /*
       * Phase 2 : le modèle choisit quoi crawler parmi les candidates — ou
       * l'ordre du score s'il n'y a pas de sélecteur. La décision est consignée
       * avec son coût, comme le plan.
       *
       * En mode découverte seule, personne ne crawle : payer un sélecteur pour
       * choisir des sources qu'on n'ouvrira pas serait une dépense pure. Le
       * POURQUOI est mesuré : la sélection coûte 300 à 600 µ$ par tour.
       */
      const candidates = [...candidatesByUrl.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SELECTION_CANDIDATES);
      let selection: SourceSelection = { urls: [], source: "score" };
      if (!config.discoveryOnly) {
        const selectionUsageBefore = deps.model.usage?.();
        selection = await selector.select({
          objective,
          candidates,
          maxSources: Math.max(1, config.maxPages - counters.pageCount),
        });
        const selectionUsage = usageDelta(selectionUsageBefore, deps.model.usage?.());
        await deps.runStore.recordAction(runId, {
          kind: ACTION_KIND.DISCOVER,
          detail: `sélection ${selection.source} · ${String(selection.urls.length)} source(s) sur ${String(candidates.length)}${
            errorPagesSkipped === 0
              ? ""
              : ` · ${String(errorPagesSkipped)} page(s) en erreur écartée(s)`
          }`,
          count: selection.urls.length,
          costMicroUsd:
            selectionUsage !== null && deps.modelCost !== undefined
              ? deps.modelCost(selectionUsage)
              : 0,
        });
      }

      /*
       * Phase 3 : crawl et extraction, dans l'ordre choisi. En mode découverte
       * seule, la phase est vide : mesuré, l'extraction de pages d'entreprises ne
       * rendait aucune offre du périmètre (0 sur 4 251) pour ~1 600 µ$ par run,
       * alors que la découverte, elle, fait entrer des entreprises au registre.
       */
      if (config.discoveryOnly) {
        await deps.runStore.recordAction(runId, {
          kind: ACTION_KIND.DISCOVER,
          detail: `découverte seule · ${String(candidates.length)} candidate(s), crawl et extraction ignorés`,
          count: 0,
        });
      }

      for (const sourceUrl of config.discoveryOnly ? [] : selection.urls) {
        if (shouldStop() || roundExhausted()) {
          break;
        }

        /*
         * Conformité : le registre décide si cette source peut être visitée.
         * Le refus est consigné, jamais silencieux — c'est ce qui permet de
         * constater qu'une source a été écartée pour une raison de droit, et
         * non parce qu'elle n'a rien rendu.
         */
        if (deps.sourceGate !== undefined) {
          const verdict = await deps.sourceGate(sourceUrl);
          if (!verdict.allowed) {
            await deps.runStore.recordAction(runId, {
              kind: ACTION_KIND.DISCOVER,
              detail: `source refusée · ${sourceUrl} · ${verdict.reason}`,
              count: 0,
            });
            continue;
          }
        }

        // Mémoire : une URL déjà visitée n'est pas re-crawlée dans ce run.
        /*
         * Identité de la source. La résolution de redirection est une aide : si
         * elle échoue, on garde l'adresse demandée et le crawl se comporte comme
         * avant.
         */
        let memoryKey = crawlKey(sourceUrl);
        if (deps.resolveUrl !== undefined) {
          try {
            const resolved = await deps.resolveUrl(sourceUrl);
            if (resolved !== null) {
              memoryKey = crawlKey(resolved);
            }
          } catch (error) {
            await recordError(ACTION_KIND.CRAWL, errorMessage(error));
          }
        }
        if (crawledKeys.has(memoryKey)) {
          continue;
        }
        try {
          if (await deps.memoryStore.alreadySeen(MEMORY_KIND.VISITED_URL, memoryKey)) {
            continue;
          }
        } catch (error) {
          await recordError(ACTION_KIND.CRAWL, errorMessage(error));
          continue;
        }

        // Crawl borné : un échec de source est consigné, le run continue.
        let crawlResult: CrawlResult;
        try {
          crawlResult = await deps.crawl(
            crawlOptionsFor(sourceUrl, config, deadline, roundPageLimit - counters.pageCount),
          );
        } catch (error) {
          await recordError(ACTION_KIND.CRAWL, errorMessage(error));
          continue;
        }

        counters.sourceCount += 1;

        for (const page of crawlResult.pages) {
          if (shouldStop() || roundExhausted()) {
            break;
          }

          /*
           * Deux écritures de la même page (`/board` et `/board?`) : mesuré sur un
           * run réel, les deux étaient comptées et extraites. On ne paie la
           * seconde ni en budget ni en extraction — y compris si elle a déjà été
           * traitée par un run antérieur, la mémoire étant persistante.
           */
          const pageKey = crawlKey(page.url);
          if (crawledKeys.has(pageKey)) {
            continue;
          }
          try {
            if (await deps.memoryStore.alreadySeen(MEMORY_KIND.VISITED_URL, pageKey)) {
              continue;
            }
          } catch (error) {
            await recordError(ACTION_KIND.CRAWL, errorMessage(error));
          }

          // La page compte dans la borne, qu'elle soit lisible ou non.
          counters.pageCount += 1;
          /*
           * Mémorisée seulement maintenant, une fois qu'elle entre dans le
           * budget : une page lue mais jamais traitée (le crawler peut en rendre
           * plus qu'il n'en reste au tour) ne doit pas être inscrite comme
           * visitée, sinon ses offres seraient sautées pour toujours.
           */
          crawledKeys.add(pageKey);
          try {
            await deps.memoryStore.remember(MEMORY_KIND.VISITED_URL, pageKey);
          } catch (error) {
            await recordError(ACTION_KIND.CRAWL, errorMessage(error));
          }
          await deps.runStore.recordAction(runId, {
            kind: ACTION_KIND.CRAWL,
            detail: page.url,
          });

          /*
           * Statut hors 2xx : la réponse est une erreur, pas une page d'offres.
           * On ne paie ni relecture ni extraction pour elle. Le statut 0 est
           * exclu : il signifie « jamais lue » (réseau), pas « erreur servie »,
           * et c'est la relecture qui le traite.
           */
          if (page.status !== 0 && (page.status < 200 || page.status >= 300)) {
            await deps.runStore.recordAction(runId, {
              kind: ACTION_KIND.EXTRACT,
              detail: `${page.url} · statut ${String(page.status)}`,
              count: 0,
            });
            continue;
          }

          /*
           * Une page sans contenu a épuisé les étapes 1 et 2 du cascade : le
           * crawler a déjà tenté HTTP, puis le navigateur quand le HTML le
           * demandait. On lui offre une dernière relecture bornée, puis on
           * abandonne en consignant l'échec — jamais en silence. Un refus
           * `robots.txt` n'est pas une erreur : la page n'a pas le droit d'être
           * lue, on la saute. Sans fonction de relecture, ou borne atteinte, le
           * comportement d'origine est conservé : la page vide est ignorée.
           */
          let usable = page;
          if (page.text.trim() === "" && page.html.trim() === "") {
            if (page.robotsDenied) {
              continue;
            }
            if (deps.recoverPage === undefined || recoveriesUsed >= config.maxRecoveries) {
              continue;
            }

            recoveriesUsed += 1;
            const read = await runRecovery<CrawledPage>([
              {
                strategy: RECOVERY_STRATEGY.READ,
                maxAttempts: 2,
                run: () => deps.recoverPage?.(page.url) ?? Promise.resolve(null),
              },
            ]);

            if (read.found) {
              usable = read.value;
              // Une relecture est un fait de collecte, pas une page de plus :
              // le compte `pages` ne bouge pas, la trace reste.
              await deps.runStore.recordAction(runId, {
                kind: ACTION_KIND.CRAWL,
                detail: `${page.url} · relecture (${RECOVERY_STRATEGY.READ})`,
                count: 0,
              });
            } else {
              const failure = read.attempts.find((attempt) => attempt.outcome === "error");
              await recordError(
                ACTION_KIND.CRAWL,
                `${page.url} : page illisible après relecture${
                  failure?.error === undefined ? "" : ` (${failure.error})`
                }`,
                true,
              );
              continue;
            }
          }

          /*
           * Porte déterministe : une page qui ne nomme aucun contrat du
           * périmètre ne peut pas porter d'offre du périmètre. Le modèle n'est
           * donc pas appelé — mesuré sur un run réel, un board hors périmètre
           * coûtait un appel par page pour des offres toutes rejetées ensuite.
           * La racine d'un board d'ATS est écartée elle aussi : elle liste tous
           * les contrats, et ses pages d'offre seront extraites à leur tour.
           */
          if (!pageGate(usable)) {
            const reason =
              deps.pageGate !== undefined
                ? "hors porte"
                : isAtsBoardListing(usable.url)
                  ? "liste ATS"
                  : "hors contrat";
            await deps.runStore.recordAction(runId, {
              kind: ACTION_KIND.EXTRACT,
              detail: `${usable.url} · ${reason}`,
              count: 0,
            });
            continue;
          }

          /*
           * Extraction en cascade (section 4.7) : l'extraction spécialisée
           * d'abord, déterministe et gratuite ; le modèle ensuite, seule étape
           * payante. Un étage qui ne trouve rien passe la main au suivant. Seul
           * un échec est relancé, et seulement là où il peut être transitoire :
           * la lecture des données structurées est pure, elle ne tourne qu'une
           * fois, alors que l'appel au modèle est retenté. Si tout échoue, la
           * page est abandonnée avec sa raison, et la suivante continue.
           *
           * L'usage est relevé avant et après : les tokens consommés par les
           * tentatives, y compris refusées, sont ainsi attribués à cette page.
           */
          const usageBefore = deps.model.usage?.();
          const extraction = await runRecovery<ExtractionResult>([
            {
              strategy: RECOVERY_STRATEGY.SPECIALIZED,
              maxAttempts: 1,
              run: () => {
                const structured = specializedExtract(usable);
                return Promise.resolve(structured.offers.length > 0 ? structured : null);
              },
            },
            {
              strategy: RECOVERY_STRATEGY.LLM,
              maxAttempts: 2,
              run: async () => {
                const result = await extract(usable, deps.model);
                return result.offers.length > 0 ? result : null;
              },
            },
          ]);

          const modelUsage = usageDelta(usageBefore, deps.model.usage?.());
          const modelCostMicroUsd =
            modelUsage !== null && deps.modelCost !== undefined ? deps.modelCost(modelUsage) : 0;

          let result: ExtractionResult;
          if (extraction.found) {
            result = extraction.value;
          } else {
            const failure = extraction.attempts.find((attempt) => attempt.outcome === "error");
            if (failure !== undefined) {
              // Les tentatives ratées ont été facturées : elles restent tracées.
              await deps.runStore.recordAction(runId, {
                kind: ACTION_KIND.EXTRACT,
                detail: `${usable.url} · échec${usageSuffix(modelUsage)}`,
                count: 0,
                costMicroUsd: modelCostMicroUsd,
              });
              await recordError(
                ACTION_KIND.EXTRACT,
                `${usable.url} : ${failure.error ?? "extraction impossible"}`,
                true,
              );
              continue;
            }
            // Aucune stratégie n'a rien trouvé, et aucune n'a échoué : la page
            // ne porte pas d'offre. C'est un fait, pas une erreur.
            result = { offers: [], rejected: [] };
          }

          await deps.runStore.recordAction(runId, {
            kind: ACTION_KIND.EXTRACT,
            detail: `${usable.url} · ${extraction.found ? extraction.strategy : "aucune"}${usageSuffix(modelUsage)}`,
            // Le compteur `extracted` compte les offres trouvées, pas les pages.
            count: result.offers.length,
            costMicroUsd: modelCostMicroUsd,
          });

          // Validation puis déduplication par titre normalisé, dans ce run.
          for (const offer of result.offers) {
            counters.extractedCount += 1;
            if (!isValidOffer(offer)) {
              continue;
            }
            const key = normalizeTitle(offer.title);
            if (seenTitles.has(key)) {
              await deps.runStore.recordAction(runId, {
                kind: ACTION_KIND.DEDUP,
                detail: offer.title,
              });
              continue;
            }
            seenTitles.add(key);
            counters.retainedCount += 1;
            retainedOffers.push(offer);
          }
        }

        // La source n'est marquée qu'après ses pages : la marquer avant
        // bloquerait sa propre page, qui porte la même clé qu'elle.
        crawledKeys.add(memoryKey);
        try {
          await deps.memoryStore.remember(MEMORY_KIND.VISITED_URL, memoryKey);
        } catch (error) {
          await recordError(ACTION_KIND.CRAWL, errorMessage(error));
        }
      }

      /*
       * Second tour : le modèle voit ce que le tour a produit — sources notées,
       * offres retenues, pages visitées — et décide de la suite. Sans `refine`,
       * ou une fois les bornes atteintes, la boucle s'arrête là.
       */
      round += 1;
      if (round >= config.maxPlanRounds || planner.refine === undefined || shouldStop()) {
        break;
      }

      planUsageBefore = deps.model.usage?.();
      const refined = await planner.refine({
        objective,
        maxQueries: config.maxQueries,
        observation: {
          executedQueries: [...executedQueries],
          sources: [...observedSources],
          offers: retainedOffers.map((offer) => ({ title: offer.title, company: offer.company })),
          pagesVisited: counters.pageCount,
        },
      });
      planUsage = usageDelta(planUsageBefore, deps.model.usage?.());
      if (refined === null) {
        break;
      }
      current = refined;
    }

    // Stockage : si un persistant est fourni, on lui confie les offres retenues
    // et on consigne ce qu'il en a fait, rejets compris.
    if (counters.retainedCount > 0) {
      if (deps.persist !== undefined) {
        const result = await deps.persist(retainedOffers);
        await deps.runStore.recordAction(runId, {
          kind: ACTION_KIND.STORE,
          detail: `${String(result.inserted)} insérée(s), ${String(result.duplicates)} doublon(s), ${String(result.rejected.length)} rejetée(s)`,
          count: result.inserted,
        });

        // Chaque rejet est consigné avec son motif : sans cela, un run qui
        // n'insère rien ne dit pas pourquoi, et le motif est perdu.
        for (const rejection of result.rejected) {
          await deps.runStore.recordAction(runId, {
            kind: ACTION_KIND.REJECT,
            detail: `${rejection.title} : ${rejection.reason}`,
          });
        }
      } else {
        await deps.runStore.recordAction(runId, {
          kind: ACTION_KIND.STORE,
          detail: String(counters.retainedCount),
        });
      }
    }

    // Une borne de temps atteinte signale un arrêt volontaire, pas un échec.
    const status: TerminalRunStatus = isTimedOut()
      ? AGENT_RUN_STATUS.STOPPED
      : AGENT_RUN_STATUS.SUCCEEDED;
    await deps.runStore.finishRun(runId, status);

    return { runId, status, ...counters };
  } catch (error) {
    // Une erreur non rattrapée par une étape : on la consigne, on clôt en
    // échec, et on rend les compteurs déjà acquis.
    try {
      await recordError("RUN", errorMessage(error));
    } catch {
      // L'enregistrement de l'erreur a échoué : rien de plus à tenter.
    }
    try {
      await deps.runStore.finishRun(runId, AGENT_RUN_STATUS.FAILED);
    } catch {
      // La clôture a échoué elle aussi : le statut reste RUNNING en base.
    }
    return { runId, status: AGENT_RUN_STATUS.FAILED, ...counters };
  }
}
