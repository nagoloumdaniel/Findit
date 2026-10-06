import {
  extractLinks,
  extractText,
  findPaginationLinks,
  shouldRenderWithBrowser,
} from "./extract.js";
import { FINDIT_USER_AGENT, HttpFetcher } from "./http.js";
import type { HttpPage } from "./http.js";
import { createPlaywrightRenderer } from "./render.js";
import type { PageRenderer } from "./render.js";
import { decideRobots, parseRobots } from "./robots.js";
import type { RobotsFile } from "./robots.js";
import { CrawlConfigError } from "./types.js";
import type { CrawledPage, CrawlResult, CrawlStopReason } from "./types.js";
import { normalizeUrl } from "./url.js";

/**
 * Le crawler : une marche en largeur, bornée et respectueuse.
 *
 * Il ouvre une page en HTTP, bascule sur le navigateur headless quand le HTML
 * a besoin de JavaScript, respecte `robots.txt`, suit les redirections et
 * s'arrête net dès qu'une borne est atteinte. Les bornes ne se contournent pas :
 * atteindre `maxDepth`, `maxPages` ou `maxRuntimeMs` arrête le crawl et le
 * signale par `stopReason`, jamais par une boucle silencieuse.
 */

const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const monotonicNow = (): number => performance.now();

export interface CrawlOptions {
  readonly startUrl: string;
  /** Profondeur maximale depuis `startUrl`. 0 ne lit que la page de départ. */
  readonly maxDepth: number;
  readonly maxPages: number;
  readonly maxRuntimeMs: number;
  readonly userAgent?: string;
  readonly minRequestIntervalMs?: number;
  /** Vrai pour ne jamais quitter l'origine de `startUrl`. Défaut : vrai. */
  readonly sameOriginOnly?: boolean;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly monotonicNow?: () => number;
  /** Repli navigateur. Défaut : Playwright headless. */
  readonly renderer?: PageRenderer;
  readonly shouldRender?: (page: HttpPage) => boolean;
}

interface CrawlerDeps {
  readonly fetcher: HttpFetcher;
  readonly renderer: PageRenderer;
  readonly shouldRender: (page: HttpPage) => boolean;
  readonly maxDepth: number;
  readonly maxPages: number;
  readonly maxRuntimeMs: number;
  readonly sameOriginOnly: boolean;
  readonly monotonicNow: () => number;
  readonly userAgent: string;
}

interface QueueItem {
  readonly url: string;
  readonly depth: number;
}

export class Crawler {
  readonly #deps: CrawlerDeps;

  constructor(deps: CrawlerDeps) {
    this.#deps = deps;
  }

  async run(startUrl: string): Promise<CrawlResult> {
    const start = normalizeUrl(startUrl);
    const startOrigin = new URL(start).origin;
    const deadline = this.#deps.monotonicNow() + this.#deps.maxRuntimeMs;

    const pages: CrawledPage[] = [];
    const queue: QueueItem[] = [{ url: start, depth: 0 }];
    const visited = new Set<string>();
    const robotsCache = new Map<string, RobotsFile | null>();
    let robotsDeniedCount = 0;

    while (queue.length > 0) {
      if (this.#deps.monotonicNow() >= deadline) {
        return this.#result(pages, "maxRuntime", visited.size, robotsDeniedCount);
      }

      if (pages.length >= this.#deps.maxPages) {
        return this.#result(pages, "maxPages", visited.size, robotsDeniedCount);
      }

      const item = queue.shift();
      if (item === undefined) {
        break;
      }

      if (visited.has(item.url)) {
        continue;
      }

      const parsed = new URL(item.url);
      if (this.#deps.sameOriginOnly && parsed.origin !== startOrigin) {
        // Lien hors de l'origine de départ : borné par respect, on ne le suit
        // pas. Le marquer évite de le réexaminer s'il réapparaît plus tard.
        visited.add(item.url);
        continue;
      }

      visited.add(item.url);

      // `robots.txt` du domaine, lu une seule fois puis mis en cache. Un
      // fichier absent ou illisible rend `null` : le domaine n'a rien annoncé,
      // donc rien n'est interdit.
      const robots = await this.#robotsFor(parsed, robotsCache);

      const robotsPath = parsed.pathname + parsed.search;
      const decision =
        robots === null ? null : decideRobots(robots, this.#deps.userAgent, robotsPath);
      const crawlDelayMs = decision?.crawlDelayMs ?? null;

      if (decision?.verdict === "DISALLOWED") {
        robotsDeniedCount += 1;
        pages.push({
          url: item.url,
          depth: item.depth,
          html: "",
          text: "",
          status: 0,
          robotsDenied: true,
        });
        continue;
      }

      // Lecture de la page : HTTP d'abord, navigateur ensuite si le HTML a
      // besoin de JavaScript. Le `Crawl-delay` annoncé s'ajoute à la cadence.
      let httpPage: HttpPage;
      try {
        httpPage = await this.#deps.fetcher.get(item.url, crawlDelayMs ?? 0);
      } catch {
        // Erreur réseau : la page n'a pas pu être lue. On l'enregistre comme un
        // fait et on continue, une page morte ne doit pas tuer tout le crawl.
        pages.push({
          url: item.url,
          depth: item.depth,
          html: "",
          text: "",
          status: 0,
          robotsDenied: false,
        });
        continue;
      }

      // Redirection suivie par le client : l'URL finale ne doit pas être
      // re-crawlée comme une page neuve.
      if (httpPage.url !== item.url) {
        visited.add(httpPage.url);
      }

      let html = httpPage.html;
      let text = extractText(html);
      let status = httpPage.status;

      if (this.#deps.shouldRender(httpPage)) {
        try {
          const rendered = await this.#deps.renderer.render(httpPage.url);
          html = rendered.html;
          text = rendered.text;
          status = rendered.status;
        } catch {
          // Le repli navigateur a échoué : on garde la version HTTP plutôt que
          // de perdre la page. Le texte peut alors rester vide, c'est un fait.
        }
      }

      pages.push({
        url: httpPage.url,
        depth: item.depth,
        html,
        text,
        status,
        robotsDenied: false,
      });

      // Une page en erreur n'offre rien à suivre.
      if (status < 200 || status >= 300) {
        continue;
      }

      // Les liens sont résolus contre l'URL finale, celle qui a réellement
      // servi le contenu, pas contre l'adresse qui a redirigé.
      const baseForLinks = httpPage.url;

      // Profondeur maximale atteinte : plus de descendants, mais la pagination
      // continue le même listing au même niveau, elle reste autorisée.
      const canDescend = item.depth < this.#deps.maxDepth;

      if (canDescend) {
        for (const child of extractLinks(html, baseForLinks)) {
          if (visited.has(child)) {
            continue;
          }
          if (this.#deps.sameOriginOnly && new URL(child).origin !== startOrigin) {
            continue;
          }
          queue.push({ url: child, depth: item.depth + 1 });
        }
      }

      // La pagination continue le même listing : même profondeur, pas plus bas.
      for (const next of findPaginationLinks(html, baseForLinks)) {
        if (visited.has(next)) {
          continue;
        }
        if (this.#deps.sameOriginOnly && new URL(next).origin !== startOrigin) {
          continue;
        }
        queue.push({ url: next, depth: item.depth });
      }
    }

    return this.#result(pages, "completed", visited.size, robotsDeniedCount);
  }

  async close(): Promise<void> {
    await this.#deps.renderer.close();
  }

  #robotsFor(parsed: URL, cache: Map<string, RobotsFile | null>): Promise<RobotsFile | null> {
    const key = parsed.origin;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    const robotsUrl = `${key}/robots.txt`;
    return this.#deps.fetcher
      .get(robotsUrl)
      .then((page) => {
        const file = page.status >= 200 && page.status < 300 ? parseRobots(page.html) : null;
        cache.set(key, file);
        return file;
      })
      .catch(() => {
        cache.set(key, null);
        return null;
      });
  }

  #result(
    pages: readonly CrawledPage[],
    stopReason: CrawlStopReason,
    visitedCount: number,
    robotsDeniedCount: number,
  ): CrawlResult {
    return {
      pages,
      stopReason,
      truncated: stopReason !== "completed",
      visitedCount,
      robotsDeniedCount,
    };
  }
}

export const createCrawler = (options: CrawlOptions): Crawler => {
  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0) {
    throw new CrawlConfigError("maxDepth doit être un entier positif ou nul.");
  }
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
    throw new CrawlConfigError("maxPages doit être un entier strictement positif.");
  }
  if (!Number.isFinite(options.maxRuntimeMs) || options.maxRuntimeMs <= 0) {
    throw new CrawlConfigError("maxRuntimeMs doit être strictement positif.");
  }

  const userAgent = options.userAgent ?? FINDIT_USER_AGENT;
  const now = options.monotonicNow ?? monotonicNow;

  const fetcher = new HttpFetcher({
    userAgent,
    minRequestIntervalMs: options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
    fetch: options.fetch ?? globalThis.fetch,
    sleep: options.sleep ?? defaultSleep,
    monotonicNow: now,
  });

  return new Crawler({
    fetcher,
    renderer: options.renderer ?? createPlaywrightRenderer(),
    shouldRender: options.shouldRender ?? shouldRenderWithBrowser,
    maxDepth: options.maxDepth,
    maxPages: options.maxPages,
    maxRuntimeMs: options.maxRuntimeMs,
    sameOriginOnly: options.sameOriginOnly ?? true,
    monotonicNow: now,
    userAgent,
  });
};

/** Coup unique : crée le crawler, collecte, puis referme le navigateur. */
export const crawl = async (options: CrawlOptions): Promise<CrawlResult> => {
  const crawler = createCrawler(options);
  try {
    return await crawler.run(options.startUrl);
  } finally {
    await crawler.close();
  }
};
