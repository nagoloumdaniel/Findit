export const FINDIT_QUEUE = Symbol("FINDIT_QUEUE");
export const JOB_PIPELINE_QUEUE = "job-pipeline";

/** Jeton d'injection du client Prisma dans le worker. */
export const WORKER_PRISMA = Symbol("WORKER_PRISMA");
/** Jeton d'injection de la configuration validée du worker. */
export const WORKER_ENV = Symbol("WORKER_ENV");
/** Jeton d'injection des options de connexion Redis. */
export const WORKER_REDIS_CONNECTION = Symbol("WORKER_REDIS_CONNECTION");

/** Nom du travail de collecte, et identifiant de sa planification récurrente. */
export const COLLECTION_CYCLE_JOB = "collection-cycle";
export const COLLECTION_SCHEDULER_ID = "collection-every-4h";
