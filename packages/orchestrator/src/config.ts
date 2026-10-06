import { DEFAULT_SCORE_THRESHOLD } from "@findit/agent";

/** Nombre maximal de requêtes de recherche exécutées par run. */
export const DEFAULT_MAX_QUERIES = 10;

/** Profondeur maximale confiée au crawler pour chaque source. */
export const DEFAULT_MAX_DEPTH = 2;

/** Nombre maximal de pages que le crawler peut lire par source. */
export const DEFAULT_MAX_PAGES_PER_SOURCE = 20;

/** Nombre maximal de pages traitées sur l'ensemble du run. */
export const DEFAULT_MAX_PAGES = 50;

/** Durée maximale du run, en millisecondes (5 minutes). */
export const DEFAULT_MAX_RUNTIME_MS = 5 * 60 * 1000;

/**
 * Nombre maximal de relectures d'une page revenue vide sur l'ensemble du run.
 * Une relecture coûte une requête, et parfois un navigateur : la borne évite
 * qu'un site entièrement vide transforme le run en machine à rendus.
 */
export const DEFAULT_MAX_RECOVERIES = 5;

/**
 * Nombre maximal de tours de planification. Le premier tour est le plan ; les
 * suivants sont des révisions décidées après avoir vu le résultat du précédent.
 * Borner ici empêche une boucle décision → outil → décision qui ne conclut pas.
 */
export const DEFAULT_MAX_PLAN_ROUNDS = 3;

/** Pays des recherches web, au sens du moteur. */
export const DEFAULT_COUNTRY = "fr";

/** Langue des résultats de recherche. */
export const DEFAULT_LANGUAGE = "fr";

/** Nombre de résultats demandés au moteur pour chaque requête. */
export const DEFAULT_RESULT_COUNT = 10;

/**
 * Bornes et réglages du run. Tous facultatifs : chaque absence retombe sur un
 * défaut choisi pour borner le run sans jamais le laisser sans limite.
 */
export interface RunAgentOptions {
  readonly maxQueries?: number;
  readonly maxDepth?: number;
  readonly maxPagesPerSource?: number;
  readonly maxPages?: number;
  readonly maxRuntimeMs?: number;
  /** Relectures maximales d'une page vide, sur l'ensemble du run. */
  readonly maxRecoveries?: number;
  /** Tours de planification maximaux, premier plan compris. */
  readonly maxPlanRounds?: number;
  readonly scoreThreshold?: number;
  readonly country?: string;
  readonly language?: string;
  readonly resultCount?: number;
  /** Horloge injectable, pour rendre les bornes de temps vérifiables en test. */
  readonly now?: () => number;
}

/** Options une fois les défauts appliqués et les bornes validées. */
export interface ResolvedOptions {
  readonly maxQueries: number;
  readonly maxDepth: number;
  readonly maxPagesPerSource: number;
  readonly maxPages: number;
  readonly maxRuntimeMs: number;
  readonly maxRecoveries: number;
  readonly maxPlanRounds: number;
  readonly scoreThreshold: number;
  readonly country: string;
  readonly language: string;
  readonly resultCount: number;
  readonly now: () => number;
}

/**
 * Configuration incohérente du run : une borne négative ou nulle n'est pas une
 * limite, c'est une faute de programmation à signaler avant tout travail.
 */
export class RunAgentConfigError extends Error {
  override readonly name = "RunAgentConfigError";
}

const defaultNow = (): number => Date.now();

/**
 * Applique les défauts puis valide les bornes anti-boucle. Une borne invalide
 * lève avant le moindre accès réseau, comme le fait le crawler pour les siennes.
 */
export const resolveOptions = (options: RunAgentOptions): ResolvedOptions => {
  const resolved: ResolvedOptions = {
    maxQueries: options.maxQueries ?? DEFAULT_MAX_QUERIES,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxPagesPerSource: options.maxPagesPerSource ?? DEFAULT_MAX_PAGES_PER_SOURCE,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
    maxRuntimeMs: options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS,
    maxRecoveries: options.maxRecoveries ?? DEFAULT_MAX_RECOVERIES,
    maxPlanRounds: options.maxPlanRounds ?? DEFAULT_MAX_PLAN_ROUNDS,
    scoreThreshold: options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD,
    country: options.country ?? DEFAULT_COUNTRY,
    language: options.language ?? DEFAULT_LANGUAGE,
    resultCount: options.resultCount ?? DEFAULT_RESULT_COUNT,
    now: options.now ?? defaultNow,
  };

  if (!Number.isInteger(resolved.maxQueries) || resolved.maxQueries < 1) {
    throw new RunAgentConfigError("maxQueries doit être un entier strictement positif.");
  }
  if (!Number.isInteger(resolved.maxDepth) || resolved.maxDepth < 0) {
    throw new RunAgentConfigError("maxDepth doit être un entier positif ou nul.");
  }
  if (!Number.isInteger(resolved.maxPagesPerSource) || resolved.maxPagesPerSource < 1) {
    throw new RunAgentConfigError("maxPagesPerSource doit être un entier strictement positif.");
  }
  if (!Number.isInteger(resolved.maxPages) || resolved.maxPages < 1) {
    throw new RunAgentConfigError("maxPages doit être un entier strictement positif.");
  }
  if (!Number.isFinite(resolved.maxRuntimeMs) || resolved.maxRuntimeMs <= 0) {
    throw new RunAgentConfigError("maxRuntimeMs doit être strictement positif.");
  }
  if (!Number.isInteger(resolved.maxRecoveries) || resolved.maxRecoveries < 0) {
    throw new RunAgentConfigError("maxRecoveries doit être un entier positif ou nul.");
  }
  if (!Number.isInteger(resolved.maxPlanRounds) || resolved.maxPlanRounds < 1) {
    throw new RunAgentConfigError("maxPlanRounds doit être un entier strictement positif.");
  }
  if (
    !Number.isFinite(resolved.scoreThreshold) ||
    resolved.scoreThreshold < 0 ||
    resolved.scoreThreshold > 100
  ) {
    throw new RunAgentConfigError("scoreThreshold doit être un nombre entre 0 et 100.");
  }

  return resolved;
};
