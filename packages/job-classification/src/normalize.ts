/**
 * Réduit un texte à une forme comparable : minuscules, sans accent, sans
 * ponctuation, espaces uniques. Les bornes de mot deviennent donc de simples
 * espaces, ce qui rend la recherche de mot entier fiable.
 *
 * Le point est retiré comme le reste : « Node.js » devient « node js », et
 * « .NET » devient « net ». Les motifs sont écrits en conséquence.
 */
export const normalizeForMatching = (text: string): string =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9+#]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ")} `;
