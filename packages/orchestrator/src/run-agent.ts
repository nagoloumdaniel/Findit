import {
  ACTION_KIND,
  AGENT_RUN_STATUS,
  MEMORY_KIND,
  generateSearchQueries,
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
import { extractJobsFromPage } from "@findit/extract";
import type { ExtractModel, ExtractionResult } from "@findit/extract";
import type { WebSearchProvider, WebSearchQuery, WebSearchResult } from "@findit/job-connectors";

import { resolveOptions } from "./config.js";
import type { ResolvedOptions, RunAgentOptions } from "./config.js";
import { isValidOffer, normalizeTitle } from "./dedup.js";

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
 * Construit les options de crawl d'une source. Le crawler reçoit le temps qui
 * reste au run : une source ne peut pas consommer à elle seule tout le budget.
 */
const crawlOptionsFor = (
  startUrl: string,
  options: ResolvedOptions,
  deadline: number,
): CrawlOptions => ({
  startUrl,
  maxDepth: options.maxDepth,
  maxPages: options.maxPagesPerSource,
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

  const isTimedOut = (): boolean => config.now() >= deadline;
  const shouldStop = (): boolean => isTimedOut() || counters.pageCount >= config.maxPages;

  const recordError = async (kind: string, message: string): Promise<void> => {
    counters.errorCount += 1;
    await deps.runStore.recordError(runId, { kind, message });
  };

  const seenTitles = new Set<string>();
  const retainedOffers: ExtractionResult["offers"][number][] = [];

  try {
    // Génération des requêtes, bornée au nombre autorisé par run.
    const queries = generateSearchQueries(objective).slice(0, config.maxQueries);

    for (const query of queries) {
      if (shouldStop()) {
        break;
      }

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
        if (shouldStop()) {
          break;
        }
        if (!source.keep) {
          continue;
        }

        const sourceUrl = source.result.url;

        // Mémoire : une URL déjà visitée n'est pas re-crawlée dans ce run.
        try {
          if (await deps.memoryStore.alreadySeen(MEMORY_KIND.VISITED_URL, sourceUrl)) {
            continue;
          }
        } catch (error) {
          await recordError(ACTION_KIND.CRAWL, errorMessage(error));
          continue;
        }

        // Crawl borné : un échec de source est consigné, le run continue.
        let crawlResult: CrawlResult;
        try {
          crawlResult = await deps.crawl(crawlOptionsFor(sourceUrl, config, deadline));
        } catch (error) {
          await recordError(ACTION_KIND.CRAWL, errorMessage(error));
          continue;
        }

        try {
          await deps.memoryStore.remember(MEMORY_KIND.VISITED_URL, sourceUrl);
        } catch (error) {
          // La mémoire est une aide, pas un garde-fou : la borne de pages
          // ci-dessous protège déjà la boucle. On consigne et on continue.
          await recordError(ACTION_KIND.CRAWL, errorMessage(error));
        }

        counters.sourceCount += 1;

        for (const page of crawlResult.pages) {
          if (shouldStop()) {
            break;
          }

          // La page compte dans la borne, qu'elle soit lisible ou non.
          counters.pageCount += 1;
          await deps.runStore.recordAction(runId, {
            kind: ACTION_KIND.CRAWL,
            detail: page.url,
          });

          // Une page sans contenu (refus robots.txt ou erreur réseau) n'offre
          // rien à extraire : elle a déjà été comptée, on passe à la suivante.
          if (page.text.trim() === "" && page.html.trim() === "") {
            continue;
          }

          // Extraction : un échec de page est consigné, la suivante continue.
          let extraction: ExtractionResult;
          try {
            extraction = await extract(page, deps.model);
          } catch (error) {
            await recordError(ACTION_KIND.EXTRACT, errorMessage(error));
            continue;
          }
          await deps.runStore.recordAction(runId, {
            kind: ACTION_KIND.EXTRACT,
            detail: page.url,
          });

          // Validation puis déduplication par titre normalisé, dans ce run.
          for (const offer of extraction.offers) {
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
      }
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
