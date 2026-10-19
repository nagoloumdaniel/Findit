import type { JobContract } from "@findit/shared";

import { normalizeForMatching } from "./normalize.js";

export type ContractSignal = {
  readonly contract: JobContract | null;
  /** Ce qui a été lu, cité tel quel. */
  readonly reason: string | null;
};

/*
 * Vocabulaire relevé sur les offres réelles de Greenhouse et Lever, français et
 * anglais, étendu aux six catégories de contrat de la plateforme. Le tutoiement
 * et les variantes régionales de Lever - « FR Apprentice », « FR Intern » - en
 * font partie : ce sont les valeurs que la source écrit vraiment, pas celles
 * qu'elle devrait écrire.
 *
 * Chaque entrée est écrite dans la forme normalisée de `normalizeForMatching` :
 * minuscules, sans accent, mots séparés par des espaces uniques.
 */
const ALTERNANCE = [
  "alternance",
  "alternant",
  "alternante",
  "apprentissage",
  "apprenti",
  "apprentie",
  "apprentice",
  "apprenticeship",
  "contrat de professionnalisation",
  "professionnalisation",
  "work study",
];

const INTERNSHIP = ["stage", "stagiaire", "internship", "intern"];

const STUDENT_JOB = [
  "job etudiant",
  "job d ete",
  "job saisonnier",
  "emploi etudiant",
  "student job",
  "summer job",
  "job de vacances",
  "job vacances",
];

const INTERIM = [
  "interim",
  "interimaire",
  "mission d interim",
  "travail temporaire",
  "agence d interim",
  "contrat d interim",
  "temporary work",
  "temp agency",
];

const CDD = [
  "cdd",
  "contrat a duree determinee",
  "fixed term",
  "short term",
  "temporaire",
  "temporary",
];

const CDI = ["cdi", "contrat a duree indeterminee", "permanent", "permanent employee"];

/**
 * Contrats réellement hors périmètre : le freelance, le bénévolat et le service
 * civique. Ils ne servent pas à classer une offre - ils servent à la rejeter, et
 * à repérer qu'un libellé de contrat contredit son titre. Les mentions de régime
 * de travail (« temps plein ») ou de séniorité (« cadre ») ne sont plus des
 * signaux de rejet : un CDI ou un CDD est désormais dans le périmètre.
 */
const OUT_OF_SCOPE = [
  "freelance",
  "contractor",
  "independant",
  "auto entrepreneur",
  "volunteer",
  "benevolat",
  "volontariat",
  "volontaire",
  "service civique",
];

/**
 * Cherche un mot entier. « Internal Control Apprentice » ne parle pas de stage :
 * chercher « intern » sans borne y verrait « Internal », et rangerait une
 * alternance dans les stages.
 *
 * `normalizeForMatching` encadre le texte d'espaces et n'en laisse qu'un entre
 * les mots : chercher « mot » entouré d'espaces borne donc le mot exactement,
 * sans expression régulière ni échappement.
 */
const mentions = (haystack: string, needle: string): boolean => haystack.includes(` ${needle} `);

const firstMatch = (haystack: string, needles: readonly string[]): string | null =>
  needles.find((needle) => mentions(haystack, needle)) ?? null;

/*
 * Ordre de lecture : du contrat le plus spécifique au plus générique, pour que
 * « stage ou alternance » lise l'alternance, « travail temporaire » lise
 * l'intérim avant le CDD, et « job étudiant » ne soit pas absorbé par « stage ».
 * Chaque libellé de contrat de la source et le titre passent par cette même
 * lecture, afin que la classification compare des signaux comparables.
 */
const CONTRACT_VOCABULARY: ReadonlyArray<{
  readonly contract: JobContract;
  readonly terms: readonly string[];
}> = [
  { contract: "ALTERNANCE", terms: ALTERNANCE },
  { contract: "STUDENT_JOB", terms: STUDENT_JOB },
  { contract: "INTERNSHIP", terms: INTERNSHIP },
  { contract: "INTERIM", terms: INTERIM },
  { contract: "CDD", terms: CDD },
  { contract: "CDI", terms: CDI },
];

/**
 * Lit le contrat d'un texte. Rend aussi le mot qui a décidé, pour que la
 * décision soit citable plutôt qu'à croire.
 */
export const readContract = (text: string): ContractSignal => {
  const normalized = normalizeForMatching(text);

  for (const { contract, terms } of CONTRACT_VOCABULARY) {
    const hit = firstMatch(normalized, terms);
    if (hit !== null) {
      return { contract, reason: hit };
    }
  }

  return { contract: null, reason: firstMatch(normalized, OUT_OF_SCOPE) };
};

/** Le texte nomme-t-il un contrat que le périmètre exclut ? */
export const mentionsOutOfScopeContract = (text: string): string | null =>
  firstMatch(normalizeForMatching(text), OUT_OF_SCOPE);
