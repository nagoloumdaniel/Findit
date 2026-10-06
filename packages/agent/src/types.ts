/**
 * Types et constantes partagés du cœur déterministe de l'agent.
 *
 * Les valeurs de ces constantes sont les chaînes exactes attendues par le
 * schéma Prisma. Elles sont redéclarées ici plutôt qu'importées de
 * `@findit/database` : ce paquet n'a ainsi pas besoin d'importer l'énumération
 * interne de Prisma, tout en restant compatible avec elle au moment d'écrire
 * en base.
 */

/** Les étapes du pipeline, telles que nommées dans `AgentAction.kind`. */
export const ACTION_KIND = {
  SEARCH: "SEARCH",
  DISCOVER: "DISCOVER",
  CRAWL: "CRAWL",
  EXTRACT: "EXTRACT",
  ANALYZE: "ANALYZE",
  VALIDATE: "VALIDATE",
  DEDUP: "DEDUP",
  STORE: "STORE",
  PUBLISH: "PUBLISH",
} as const;

export type ActionKind = (typeof ACTION_KIND)[keyof typeof ACTION_KIND];

/** Les statuts d'une exécution, tels que nommés dans `AgentRun.status`. */
export const AGENT_RUN_STATUS = {
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  STOPPED: "STOPPED",
} as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUS)[keyof typeof AGENT_RUN_STATUS];

/** Statut d'une exécution arrivée au bout : tout sauf RUNNING. */
export type TerminalRunStatus = Exclude<AgentRunStatus, typeof AGENT_RUN_STATUS.RUNNING>;

/** Les types de mémoire, tels que nommés dans `AgentMemory.kind`. */
export const MEMORY_KIND = {
  VISITED_URL: "VISITED_URL",
  ANALYZED_URL: "ANALYZED_URL",
  SEARCH_QUERY: "SEARCH_QUERY",
  SOURCE_PATTERN: "SOURCE_PATTERN",
} as const;

export type MemoryKind = (typeof MEMORY_KIND)[keyof typeof MEMORY_KIND];

/** Une requête de recherche produite par l'Agent Search. */
export interface GeneratedSearchQuery {
  readonly query: string;
  readonly engine: string;
}

/** Un résultat brut à noter pendant la découverte. */
export interface SourceResult {
  readonly domain: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
}
