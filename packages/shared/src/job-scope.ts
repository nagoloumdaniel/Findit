/*
 * Les six catégories de contrat que la plateforme gère. Chaque offre porte un
 * type normalisé parmi celles-ci ; une valeur brute ambiguë est conservée dans
 * les motifs de classification, jamais transformée en certitude.
 */
export const JOB_CONTRACTS = [
  "ALTERNANCE",
  "INTERNSHIP",
  "CDI",
  "CDD",
  "INTERIM",
  "STUDENT_JOB",
] as const;
export type JobContract = (typeof JOB_CONTRACTS)[number];

export const JOB_ROLE_CATEGORIES = [
  "FRONTEND",
  "BACKEND",
  "FULLSTACK",
  "SOFTWARE_ENGINEERING",
  "OTHER_DEVELOPER",
  "MOBILE",
  "DATA_ANALYST",
  "DATA_ENGINEER",
  "OTHER",
] as const;
export type JobRoleCategory = (typeof JOB_ROLE_CATEGORIES)[number];

/*
 * Ce que le flux montre quand personne n'a rien demandé.
 *
 * Stocker et montrer sont deux choses. Le périmètre ci-dessus dit ce qui a le
 * droit d'exister en base ; celui-ci dit seulement ce qui s'affiche par défaut.
 * Une offre hors de ce défaut reste collectée, stockée et atteignable par un
 * filtre - changer d'avis est alors un réglage, jamais une migration.
 */
export const DEFAULT_CONTRACTS: readonly JobContract[] = [...JOB_CONTRACTS];

/**
 * Tous les métiers, tous domaines confondus. Le classifieur range dans `OTHER`
 * ce qui ne relève pas d'une spécialité technique nommée : la plateforme ne se
 * limite plus au développement.
 */
export const DEFAULT_ROLE_CATEGORIES: readonly JobRoleCategory[] = [...JOB_ROLE_CATEGORIES];

export const JOB_WORK_MODES = ["ONSITE", "HYBRID", "REMOTE"] as const;
export type JobWorkMode = (typeof JOB_WORK_MODES)[number];

/// Départements d'Île-de-France. La même liste est tenue par une contrainte de
/// contrôle sur la table Job, afin qu'une écriture hors périmètre soit refusée
/// même si elle contourne l'application.
export const ILE_DE_FRANCE_DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"] as const;
export type IleDeFranceDepartment = (typeof ILE_DE_FRANCE_DEPARTMENTS)[number];

export const DEFAULT_MAX_AGE_HOURS = 24;
/// Plafond absolu de fraîcheur : cinq jours calendaires glissants (120 h).
export const EXTENDED_MAX_AGE_HOURS = 120;

/// Millisecondes d'une journée, moins une : la fin d'une journée UTC.
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Une date sans heure désigne une journée entière.
 *
 * Le POURQUOI : plusieurs sources ne donnent qu'un jour (« 2026-10-04 »), que
 * `new Date` place à minuit UTC. Comparer ce minuit à un seuil de 120 h fait
 * tomber l'offre dès le début du 6e jour, alors que la source dit seulement
 * qu'elle est du 6. Une date à minuit UTC exactement est donc étendue à la fin
 * de sa journée ; une date horodatée n'est jamais touchée. La date publiée
 * stockée, elle, reste celle de la source : seule la décision de fraîcheur (et
 * l'expiration qui en découle) élargit la journée.
 */
export const endOfDayIfDateOnly = (date: Date): Date =>
  date.getUTCHours() === 0 &&
  date.getUTCMinutes() === 0 &&
  date.getUTCSeconds() === 0 &&
  date.getUTCMilliseconds() === 0
    ? new Date(date.getTime() + DAY_MS - 1)
    : date;

/// Fenêtres de fraîcheur proposées à l'utilisateur. Aucune valeur au-delà de
/// EXTENDED_MAX_AGE_HOURS n'est acceptable : une offre plus ancienne ne doit
/// jamais être affichée.
export const FRESHNESS_WINDOWS = {
  LAST_24H: DEFAULT_MAX_AGE_HOURS,
  LAST_5D: EXTENDED_MAX_AGE_HOURS,
} as const;
export type FreshnessWindow = keyof typeof FRESHNESS_WINDOWS;

/// Borne basse de publication pour une fenêtre donnée. `now` est passé plutôt
/// que lu, afin que le calcul reste testable et reproductible.
export const publishedAfterFor = (window: FreshnessWindow, now: Date): Date =>
  new Date(now.getTime() - FRESHNESS_WINDOWS[window] * 60 * 60 * 1000);
