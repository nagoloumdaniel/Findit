import type { JobOffer } from "./schema.js";

/**
 * Détection déterministe des offres d'écoles, d'organismes de formation, de
 * bootcamps ou de campus.
 *
 * Ce n'est qu'un garde-fou : l'analyse LLM (agent Analyze) reste la détection
 * fine. Ici, on écarte de façon sûre, sans dépendre du modèle, les cas les plus
 * évidents. On ne regarde que deux signaux : un mot d'école dans le titre ou le
 * nom de l'entreprise (là où le mot désigne l'OBJET de l'offre), et une
 * tournure de description qui fait de la formation l'objet de l'offre. Un
 * « diplôme bac+5 » cité comme prérequis dans la description n'écarte donc pas
 * l'offre. Le garde-fou sur-écarte volontairement : le projet exclut les écoles
 * par décision, et un faux positif coûte moins cher qu'une offre d'école publiée.
 */

/** Rabat casse et accents pour comparer des variantes écrites différemment. */
const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Mots qui, dans le titre ou le nom de l'entreprise, désignent presque toujours
 * une école ou une formation plutôt qu'un poste à pourvoir.
 */
const SCHOOL_MARKERS: readonly string[] = [
  "ecole",
  "school",
  "formation",
  "bootcamp",
  "campus",
  "diplome",
  "diploma",
  "universite",
  "university",
  "lycee",
];

/**
 * Tournures de description qui font de la formation ou du cursus l'OBJET de
 * l'offre, par opposition à un prérequis (« diplôme bac+5 requis »).
 */
const SCHOOL_DESCRIPTION_PHRASES: readonly string[] = [
  "notre ecole",
  "nos formations",
  "notre formation",
  "notre bootcamp",
  "notre campus",
  "nos campus",
  "notre universite",
  "titre rncp",
  "diplome reconnu",
  "formation certifiante",
  "formation diplomante",
  "delivre un diplome",
  "delivre le diplome",
  "rejoignez notre ecole",
  "rejoins notre ecole",
];

const containsAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

/**
 * Vrai quand l'offre ressemble à une école, un organisme de formation, un
 * bootcamp ou un campus. Fonction pure et déterministe : même entrée, même
 * sortie, ce qui la rend testable sans modèle.
 */
export const looksLikeSchool = (offer: JobOffer): boolean => {
  const titleAndCompany = normalize(`${offer.title} ${offer.company}`);
  if (containsAny(titleAndCompany, SCHOOL_MARKERS)) {
    return true;
  }
  const description = normalize(offer.description ?? "");
  return containsAny(description, SCHOOL_DESCRIPTION_PHRASES);
};
