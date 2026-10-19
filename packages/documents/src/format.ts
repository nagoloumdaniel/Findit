/** Ne garde que les chaînes non vides, après suppression des espaces superflus. */
export const clean = (values: (string | undefined)[]): string[] =>
  values.filter((value): value is string => value !== undefined && value.trim() !== "");

/** « 2024 - 2026 », ou la seule borne connue ; null quand on ne sait rien. */
export const period = (start: string | undefined, end: string | undefined): string | null => {
  const parts = clean([start, end]);
  if (parts.length === 0) {
    return null;
  }
  return parts.length === 2 ? `${parts[0] ?? ""} - ${parts[1] ?? ""}` : (parts[0] ?? null);
};

/** Une adresse écrite sans protocole reste cliquable : le lien la complète. */
export const toHref = (url: string): string => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
