/**
 * La comparaison doit ignorer la casse, l'accentuation et les espaces
 * multiples, mais jamais le contenu : « Développeur Front-End » et
 * « developpeur front end » désignent la même chose.
 */
export const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Les identifiants techniques gardent « + », « # » et « . » : « c++ », « c# »
// et « node.js » sont des mots entiers, pas de la ponctuation à jeter.
const TOKEN_PATTERN = /[a-z0-9+#.]+/g;

/** Découpe un texte normalisé en jetons comparables, points de fin exclus. */
export const tokenize = (text: string): string[] => {
  const matches = normalizeText(text).match(TOKEN_PATTERN);
  if (matches === null) {
    return [];
  }
  return matches.map((token) => token.replace(/\.+$/g, "")).filter((token) => token.length > 0);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Vérifie qu'un alias apparaît comme mot entier dans un texte déjà normalisé.
 * La frontière est personnalisée pour que « java » ne matche pas dans
 * « javascript » et que « c++ » ou « .net » restent reconnaissables.
 */
export const containsAlias = (normalizedText: string, alias: string): boolean => {
  const pattern = new RegExp(`(?<![a-z0-9+#.])${escapeRegExp(alias)}(?![a-z0-9+#])`, "u");
  return pattern.test(normalizedText);
};
