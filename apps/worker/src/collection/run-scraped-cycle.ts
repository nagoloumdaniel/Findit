import type { CollectionJob, CollectionSummary } from "./run-collection.js";

/** Ce que le cycle des sources scrapées a besoin de savoir faire, injecté. */
export interface ScrapedCycleDeps {
  /** Les collectes à lancer, déjà ordonnées du moins cher au plus cher. */
  readonly jobs: readonly CollectionJob<unknown>[];
  collect(jobs: readonly CollectionJob<unknown>[]): Promise<CollectionSummary>;
  /** Relie les journaux du cycle, y compris quand il n'y a rien à collecter. */
  readonly correlationId: string;
}

/**
 * Le cycle quotidien des job boards : aucune découverte, aucun registre
 * d'entreprises, seulement les sources scrapées que la configuration monte.
 * Sans source montée - interrupteur éteint ou jeton absent - il ne fait rien et
 * ne dépense rien : une collecte vide, pas une erreur.
 */
export const runScrapedCycle = (deps: ScrapedCycleDeps): Promise<CollectionSummary> => {
  if (deps.jobs.length === 0) {
    return Promise.resolve({
      correlationId: deps.correlationId,
      jobs: [],
      totalAccepted: 0,
      totalQuarantined: 0,
      totalRejected: 0,
    });
  }

  return deps.collect(deps.jobs);
};
