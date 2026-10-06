import {
  AGENT_COLLECTION_JOB,
  COLLECTION_CYCLE_JOB,
  SCRAPED_COLLECTION_JOB,
} from "../queue/queue.constants.js";

export class UnknownJobError extends Error {
  override readonly name = "UnknownJobError";

  constructor(readonly jobName: string) {
    super(`Travail inconnu dans la file : « ${jobName} ».`);
  }
}

/**
 * Aiguille un travail de la file vers son cycle. Les cycles partagent le même
 * consommateur en concurrence 1 : ils ne se chevauchent jamais, ce qui garde la
 * garde de budget et la cadence des sources à l'abri d'une double exécution. Un
 * nom inconnu échoue bruyamment plutôt que de lancer le mauvais cycle.
 */
export const createJobHandler =
  (cycles: {
    readonly native: () => Promise<unknown>;
    readonly scraped: () => Promise<unknown>;
    readonly agent: () => Promise<unknown>;
  }) =>
  (job: { readonly name: string }): Promise<unknown> => {
    switch (job.name) {
      case COLLECTION_CYCLE_JOB:
        return cycles.native();
      case SCRAPED_COLLECTION_JOB:
        return cycles.scraped();
      case AGENT_COLLECTION_JOB:
        return cycles.agent();
      default:
        return Promise.reject(new UnknownJobError(job.name));
    }
  };
