/**
 * Normalisation de texte pour la comparaison déterministe.
 *
 * On rabat casse et accents pour qu'une variante écrite « Île-de-France » ou
 * « ile-de-france » retombe sur la même forme. Les requêtes produites ne
 * dépendent donc pas de la casse ou des accents saisis par l'utilisateur.
 */
export const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
