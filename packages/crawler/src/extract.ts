import { load } from "cheerio";

import type { HttpPage } from "./http.js";
import { tryResolveLink } from "./url.js";

/**
 * Extraction du contenu d'une page avec Cheerio.
 *
 * Le HTML du web est écrit à la main, avec des balises non fermées et des
 * imbrications improbables. Cheerio l'analyse comme le ferait un navigateur
 * plutôt que par expressions régulières, qui rendraient un texte faux sur les
 * cas tordus sans jamais le signaler.
 */

const collapseWhitespace = (text: string): string => text.replace(/\s+/gu, " ").trim();

/**
 * Le texte visible d'une page.
 *
 * `script`, `style`, `noscript`, `template`, `head` et `svg` ne portent pas de
 * contenu lisible pour un humain : les retirer évite de noyer le texte dans du
 * code ou des métadonnées.
 */
export const extractText = (html: string): string => {
  const $ = load(html);
  $("script, style, noscript, template, head, svg").remove();

  const body = $("body");
  const raw = body.length > 0 ? body.text() : $.root().text();
  return collapseWhitespace(raw);
};

/**
 * Tous les liens suivables d'une page, résolus contre `baseUrl`, dédoublonnés et
 * dans l'ordre du document. Les `mailto:`, `javascript:` et adresses mal formées
 * sont ignorés : ils ne mènent à aucune page à crawler.
 */
export const extractLinks = (html: string, baseUrl: string): readonly string[] => {
  const $ = load(html);
  const seen = new Set<string>();
  const links: string[] = [];

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (href === undefined || href === "") {
      return;
    }

    const resolved = tryResolveLink(href, baseUrl);
    if (resolved !== null && !seen.has(resolved)) {
      seen.add(resolved);
      links.push(resolved);
    }
  });

  return links;
};

/**
 * Les textes de lien qui annoncent la page suivante. La liste reste courte et
 * volontairement sans « > » : ce caractère apparaît dans trop de liens
 * sans rapport avec la pagination.
 */
const NEXT_LINK_TEXTS = ["suivant", "suivante", "next", "older", "newer", "›", "»", "→"];

const PAGE_PARAMS = ["page", "p", "pg", "pagination"] as const;

/**
 * `candidate` est-elle la « page suivante » de `current`, au sens du paramètre
 * d'URL ? Oui quand elle pointe le même chemin avec un numéro de page supérieur
 * d'exactement un cran.
 */
const isNextPageOf = (candidate: string, current: URL): boolean => {
  const target = new URL(candidate);
  if (target.pathname !== current.pathname) {
    return false;
  }

  for (const param of PAGE_PARAMS) {
    const targetValue = target.searchParams.get(param);
    if (targetValue === null) {
      continue;
    }

    const targetNumber = Number(targetValue);
    if (!Number.isInteger(targetNumber)) {
      continue;
    }

    // Sans paramètre de page sur l'URL courante, on est implicitement page 1.
    const currentNumber = Number(current.searchParams.get(param) ?? "1");
    if (targetNumber === currentNumber + 1) {
      return true;
    }
  }

  return false;
};

/**
 * Les liens qui prolongent un listing, dans l'ordre de confiance :
 *
 * 1. `rel="next"` explicite, sur `<a>` ou `<link>`, c'est la norme ;
 * 2. le texte du lien qui annonce la suite (« Suivant », « Next », « » ») ;
 * 3. un paramètre de page qui avance d'un cran sur le même chemin.
 *
 * Le crawler suit ces liens à la même profondeur que la page courante : la page
 * suivante d'un listing n'est pas plus profonde, c'est la suite du même niveau.
 */
export const findPaginationLinks = (html: string, baseUrl: string): readonly string[] => {
  const $ = load(html);
  const results: string[] = [];
  const seen = new Set<string>();

  const push = (resolved: string | null): void => {
    if (resolved !== null && !seen.has(resolved)) {
      seen.add(resolved);
      results.push(resolved);
    }
  };

  $('a[rel~="next"], link[rel~="next"]').each((_index, element) => {
    push(tryResolveLink($(element).attr("href") ?? "", baseUrl));
  });

  $("a[href]").each((_index, element) => {
    const text = collapseWhitespace($(element).text()).toLowerCase();
    if (NEXT_LINK_TEXTS.some((token) => text.includes(token))) {
      push(tryResolveLink($(element).attr("href") ?? "", baseUrl));
    }
  });

  const current = new URL(baseUrl);
  for (const link of extractLinks(html, baseUrl)) {
    if (isNextPageOf(link, current)) {
      push(link);
    }
  }

  return results;
};

/**
 * Cette page est-elle un « listing », c'est-à-dire une page qui énumère beaucoup
 * de cibles distinctes ?
 *
 * Heuristique volontairement grossière : au moins `minLinks` chemins internes
 * différents. Un article avec un menu riche peut être pris pour un listing, et
 * c'est l'appelant qui tranche. Elle n'existe que pour aiguiller le crawler,
 * jamais pour décider seule.
 */
export const isListingPage = (html: string, baseUrl: string, minLinks = 6): boolean => {
  const links = extractLinks(html, baseUrl);
  const paths = new Set(links.map((link) => new URL(link).pathname));
  return paths.size >= minLinks;
};

/**
 * Cette page a-t-elle besoin d'un navigateur pour afficher son contenu ?
 *
 * Le serveur a déjà rendu du texte utile : non. Sinon, et si des scripts sont
 * présents, c'est le profil d'une application qui construit son contenu côté
 * navigateur : oui. Les pages en erreur ne sont jamais rendues, elles n'ont rien
 * à faire apparaître.
 */
export const shouldRenderWithBrowser = (page: HttpPage): boolean => {
  if (page.status < 200 || page.status >= 300) {
    return false;
  }

  const text = extractText(page.html);
  if (text.length >= 80) {
    return false;
  }

  return /<script[\s>]/i.test(page.html);
};
