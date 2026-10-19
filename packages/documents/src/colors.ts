/** Accent d'identité Findit : or. */
export const DEFAULT_ACCENT = "#d4af37";

/**
 * Vérifie qu'une valeur est une couleur hexadécimale #rrggbb (six chiffres
 * hexadécimaux, insensibles à la casse). Toute autre forme est rejetée.
 */
export const isValidHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

/** Résout la couleur d'accent : toute valeur invalide retombe sur le défaut. */
export const resolveAccentColor = (value: string | undefined): string =>
  value !== undefined && isValidHexColor(value) ? value : DEFAULT_ACCENT;
