import type { JobContract } from "@findit/shared";

import { normalizeForMatching } from "./normalize.js";

export type ContractSignal = {
  readonly contract: JobContract | null;
  /** Ce qui a été lu, cité tel quel. */
  readonly reason: string | null;
};

/*
 * Vocabulaire relevé sur les offres réelles de Greenhouse et Lever, français et
 * anglais. Le tutoiement et les variantes régionales de Lever — « FR Apprentice »,
 * « FR Intern » — en font partie : ce sont les valeurs que la source écrit
 * vraiment, pas celles qu'elle devrait écrire.
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

/**
 * Contrats hors périmètre. Ils ne servent pas à classer une offre — ils servent
 * à la rejeter, et à repérer qu'un libellé de contrat contredit son titre.
 */
const OUT_OF_SCOPE = [
  "cdi",
  "cdd",
  "permanent",
  "permanent employee",
  "full time",
  "fulltime",
  "temps plein",
  "fixed term",
  "short term",
  "contractor",
  "freelance",
  "executive",
  "cadre",
  "employee",
  "volunteer",
  "benevolat",
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

/**
 * Lit le contrat d'un texte. Rend aussi le mot qui a décidé, pour que la
 * décision soit citable plutôt qu'à croire.
 */
export const readContract = (text: string): ContractSignal => {
  const normalized = normalizeForMatching(text);

  const alternance = firstMatch(normalized, ALTERNANCE);
  if (alternance !== null) {
    return { contract: "ALTERNANCE", reason: alternance };
  }

  const internship = firstMatch(normalized, INTERNSHIP);
  if (internship !== null) {
    return { contract: "INTERNSHIP", reason: internship };
  }

  return { contract: null, reason: firstMatch(normalized, OUT_OF_SCOPE) };
};

/** Le texte nomme-t-il un contrat que le périmètre exclut ? */
export const mentionsOutOfScopeContract = (text: string): string | null =>
  firstMatch(normalizeForMatching(text), OUT_OF_SCOPE);
