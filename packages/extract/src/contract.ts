import type { CrawledPage } from "@findit/crawler";

/**
 * Porte déterministe avant l'extraction par modèle.
 *
 * Le POURQUOI : un board d'entreprise entièrement hors périmètre coûte un appel
 * de modèle par page, puis voit ses offres rejetées une à une faute de contrat.
 * Mesuré sur un run réel : 127 offres extraites, 101 rejetées pour « aucun
 * contrat du périmètre », zéro insérée. La porte lit le même contenu que le
 * modèle recevra — le texte visible, ou le HTML quand il n'y a pas de texte —
 * et n'appelle le modèle que si ce contenu nomme un contrat du périmètre.
 *
 * Ce n'est pas un classifieur : c'est un garde-fou de coût. Il ne décide jamais
 * qu'une offre est dans le périmètre, il décide seulement qu'il vaut la peine
 * de demander.
 */

/** Vocabulaire des contrats du périmètre, en minuscules et sans accent. */
export const PERIMETER_CONTRACT_TERMS: readonly string[] = [
  "alternance",
  "alternant",
  "apprenti",
  "professionnalisation",
  "stage",
  "stagiaire",
  "internship",
  "apprentice",
];

/** Minuscules sans accent : « Stagiaire » et « stagiaire » se rejoignent. */
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "");

/**
 * Le contenu exact que l'extraction enverrait au modèle : le texte visible, ou
 * le HTML en repli. Garder la même règle ici évite une porte plus permissive
 * que l'extraction, qui laisserait passer une page sans contrat visible.
 */
const contentOf = (page: CrawledPage): string => {
  const text = page.text.trim();
  return text !== "" ? text : page.html;
};

/** Vrai quand la page nomme au moins un contrat du périmètre. */
export const mentionsPerimeterContract = (page: CrawledPage): boolean => {
  const content = normalize(contentOf(page));
  return PERIMETER_CONTRACT_TERMS.some((term) => content.includes(term));
};
