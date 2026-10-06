import { CrawlConfigError } from "./types.js";

/**
 * Normalise une URL en adresse absolue http(s), sans fragment.
 *
 * Le fragment ne change jamais la ressource demandée : il ne fait que faire
 * défiler le navigateur. Le retirer évite de prendre deux fois la même page
 * sous deux ancres différentes, ce qui fausserait la détection des pages déjà
 * visitées.
 */
export const normalizeUrl = (raw: string, base?: string): string => {
  let parsed: URL;
  try {
    parsed = base === undefined ? new URL(raw) : new URL(raw, base);
  } catch {
    throw new CrawlConfigError(`L'URL « ${raw} » n'est pas une adresse valide.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CrawlConfigError(`Seuls http et https sont collectés, pas « ${parsed.protocol} ».`);
  }

  parsed.hash = "";
  return parsed.toString();
};

/**
 * Résout un lien trouvé dans une page, ou rend `null` quand il ne peut pas être
 * suivi : adresse mal formée, `mailto:`, `javascript:`, ancre vide, etc. Ces
 * liens ne sont pas des erreurs, ils sont simplement hors de portée du crawler.
 */
export const tryResolveLink = (href: string, base: string): string | null => {
  try {
    return normalizeUrl(href, base);
  } catch {
    return null;
  }
};

/** Deux URLs partagent-elles la même origine (protocole, hôte, port) ? */
export const sameOrigin = (a: URL, b: URL): boolean => a.origin === b.origin;
