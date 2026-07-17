export const JOB_CONTRACTS = ["ALTERNANCE", "INTERNSHIP"] as const;
export type JobContract = (typeof JOB_CONTRACTS)[number];

export const JOB_ROLE_CATEGORIES = [
  "FRONTEND",
  "BACKEND",
  "FULLSTACK",
  "MOBILE",
  "DATA_ANALYST",
  "DATA_ENGINEER",
] as const;
export type JobRoleCategory = (typeof JOB_ROLE_CATEGORIES)[number];

export const JOB_WORK_MODES = ["ONSITE", "HYBRID", "REMOTE"] as const;
export type JobWorkMode = (typeof JOB_WORK_MODES)[number];

/// Départements d'Île-de-France. La même liste est tenue par une contrainte de
/// contrôle sur la table Job, afin qu'une écriture hors périmètre soit refusée
/// même si elle contourne l'application.
export const ILE_DE_FRANCE_DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"] as const;
export type IleDeFranceDepartment = (typeof ILE_DE_FRANCE_DEPARTMENTS)[number];

export const DEFAULT_MAX_AGE_HOURS = 24;
export const EXTENDED_MAX_AGE_HOURS = 72;

/// Fenêtres de fraîcheur proposées à l'utilisateur. Aucune valeur au-delà de
/// EXTENDED_MAX_AGE_HOURS n'est acceptable : une offre plus ancienne ne doit
/// jamais être affichée.
export const FRESHNESS_WINDOWS = {
  LAST_24H: DEFAULT_MAX_AGE_HOURS,
  LAST_72H: EXTENDED_MAX_AGE_HOURS,
} as const;
export type FreshnessWindow = keyof typeof FRESHNESS_WINDOWS;

/// Borne basse de publication pour une fenêtre donnée. `now` est passé plutôt
/// que lu, afin que le calcul reste testable et reproductible.
export const publishedAfterFor = (window: FreshnessWindow, now: Date): Date =>
  new Date(now.getTime() - FRESHNESS_WINDOWS[window] * 60 * 60 * 1000);
