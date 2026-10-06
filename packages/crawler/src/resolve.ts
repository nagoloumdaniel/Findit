import { FINDIT_USER_AGENT } from "./http.js";

/**
 * Résolution d'une redirection sans lire la page.
 *
 * Le POURQUOI : mesuré sur Ivalua, `/carrieres`, `/carrieres/`,
 * `/company/careers` et `/company/careers/` mènent tous à la même page. Sans
 * résolution, l'agent paie un crawl complet pour chaque adresse, et une page
 * atteinte sous un alias n'est reconnue qu'après avoir été payée une seconde
 * fois. Un HEAD coûte des en-têtes, pas un rendu.
 *
 * La fonction ne jette jamais : elle rend `null` quand la redirection ne peut pas
 * être résolue, et l'appelant garde alors son adresse d'origine.
 */

export interface ResolveFinalUrlOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly userAgent?: string;
  readonly timeoutMs?: number;
}

/** Statuts qui signalent un serveur refusant la méthode HEAD. */
const HEAD_REFUSED = new Set([405, 501]);

const urlOf = (response: { readonly url: string }, fallback: string): string =>
  response.url === "" ? fallback : response.url;

export const resolveFinalUrl = async (
  url: string,
  options: ResolveFinalUrlOptions = {},
): Promise<string | null> => {
  const doFetch = options.fetch ?? globalThis.fetch;
  const userAgent = options.userAgent ?? FINDIT_USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const head = await doFetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": userAgent },
      signal: controller.signal,
    });

    if (!HEAD_REFUSED.has(head.status)) {
      return urlOf(head, url);
    }

    // Serveur qui refuse HEAD : une GET dont on ne lit qu'un octet, puis on
    // abandonne le corps — on ne veut que l'URL finale.
    const get = await doFetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": userAgent, range: "bytes=0-0" },
      signal: controller.signal,
    });
    await get.body?.cancel();
    return urlOf(get, url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
