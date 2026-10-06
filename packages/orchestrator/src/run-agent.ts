import { ACTION_KIND, AGENT_RUN_STATUS, MEMORY_KIND, scoreSources } from "@findit/agent";
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
  const specializedExtract = deps.specializedExtract ?? extractStructuredOffers;
  const pageGate = deps.pageGate ?? mentionsPerimeterContract;

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
    const observedSources: ObservedSource[] = [];
    const executedQueries: string[] = [];
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

          if (shouldStop() || roundExhausted()) {
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
            if (shouldStop() || roundExhausted()) {
              break;
            }

            // La page compte dans la borne, qu'elle soit lisible ou non.
            counters.pageCount += 1;
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
             */
            if (!pageGate(usable)) {
              await deps.runStore.recordAction(runId, {
                kind: ACTION_KIND.EXTRACT,
                detail: `${usable.url} · hors contrat`,
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
