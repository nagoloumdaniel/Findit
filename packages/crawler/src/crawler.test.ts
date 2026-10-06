import { describe, expect, it, vi } from "vitest";

import { crawl } from "./crawler.js";
import type { CrawlOptions } from "./crawler.js";
import type { PageRenderer } from "./render.js";
import type { CrawlResult } from "./types.js";

/**
 * Un faux serveur de page en mémoire : chaque route répond une chaîne HTML. Le
 * « fetch » enregistre les appels pour vérifier ce qui a réellement été demandé,
 * et la réponse porte une `url` finale qui permet de simuler une redirection.
 */
interface Route {
  html: string;
  status?: number;
  /** URL finale après redirection, quand elle diffère de la clé. */
  url?: string;
}

const fakeSite = (routes: Record<string, Route>, advance?: () => void) => {
  const calls: string[] = [];

  const fetch = vi.fn<typeof globalThis.fetch>((input) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    advance?.();

    const route = routes[url];
    if (route === undefined) {
      return Promise.resolve(new Response("", { status: 404 }));
    }

    const status = route.status ?? 200;
    return Promise.resolve({
      url: route.url ?? url,
      status,
      ok: status >= 200 && status < 300,
      redirected: route.url !== undefined && route.url !== url,
      text: () => Promise.resolve(route.html),
    } as unknown as Response);
  });

  return { fetch, calls };
};

/** Les appels qui ne sont pas des lectures de robots.txt. */
const pageCalls = (calls: readonly string[]): string[] =>
  calls.filter((url) => !url.endsWith("/robots.txt"));

const ALLOW_ALL = "User-agent: *\nDisallow:";

const noopRenderer: PageRenderer = {
  render: () => Promise.resolve({ html: "", text: "", status: 0 }),
  close: () => Promise.resolve(),
};

const baseOptions = {
  maxDepth: 5,
  maxPages: 20,
  maxRuntimeMs: 60_000,
  minRequestIntervalMs: 0,
  sleep: async () => {},
  monotonicNow: () => 0,
  renderer: noopRenderer,
  shouldRender: () => false,
};

const run = (
  fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>,
  startUrl: string,
  overrides: Partial<CrawlOptions> = {},
): Promise<CrawlResult> => crawl({ ...baseOptions, ...overrides, startUrl, fetch });

const pageByUrl = (result: CrawlResult, url: string) =>
  result.pages.find((page) => page.url === url);

describe("Crawler", () => {
  it("s'arrête à la profondeur maximale", async () => {
    const site = fakeSite({
      "https://example.com/robots.txt": { html: ALLOW_ALL },
      "https://example.com/": { html: `<a href="/a">a</a><a href="/b">b</a>` },
      "https://example.com/a": { html: `<a href="/deep">deep</a>` },
      "https://example.com/b": { html: "" },
      "https://example.com/deep": { html: "" },
    });

    const result = await run(site.fetch, "https://example.com/", { maxDepth: 1 });

    expect(pageCalls(site.calls)).toEqual([
      "https://example.com/",
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(result.pages.map((page) => page.depth)).toEqual([0, 1, 1]);
    expect(site.calls).not.toContain("https://example.com/deep");
  });

  it("ne relit jamais une page déjà visitée", async () => {
    const site = fakeSite({
      "https://example.com/robots.txt": { html: ALLOW_ALL },
      "https://example.com/": { html: `<a href="/a">a</a><a href="/a">a encore</a>` },
      "https://example.com/a": { html: `<a href="/">retour</a>` },
    });

    const result = await run(site.fetch, "https://example.com/");

    expect(pageCalls(site.calls)).toEqual(["https://example.com/", "https://example.com/a"]);
    expect(result.pages).toHaveLength(2);
    expect(result.visitedCount).toBe(2);
  });

  it("saute le chemin que robots.txt refuse, sans le demander", async () => {
    const site = fakeSite({
      "https://example.com/robots.txt": { html: "User-agent: *\nDisallow: /secret" },
      "https://example.com/": { html: `<a href="/secret">s</a><a href="/ok">ok</a>` },
      "https://example.com/secret": { html: "" },
      "https://example.com/ok": { html: "contenu public" },
    });

    const result = await run(site.fetch, "https://example.com/");

    expect(site.calls).not.toContain("https://example.com/secret");
    expect(pageByUrl(result, "https://example.com/secret")).toMatchObject({
      robotsDenied: true,
      status: 0,
      html: "",
    });
    expect(pageByUrl(result, "https://example.com/ok")).toMatchObject({
      robotsDenied: false,
      status: 200,
    });
    expect(result.robotsDeniedCount).toBe(1);
  });

  it("suit une redirection et enregistre l'URL finale", async () => {
    const site = fakeSite({
      "https://example.com/robots.txt": { html: ALLOW_ALL },
      "https://example.com/a": { html: "page b", url: "https://example.com/b" },
    });

    const result = await run(site.fetch, "https://example.com/a");

    expect(result.pages[0]?.url).toBe("https://example.com/b");
    expect(result.pages[0]?.html).toContain("page b");
    expect(site.calls).toContain("https://example.com/a");
    expect(site.calls).not.toContain("https://example.com/b");
  });

  it("s'arrête net quand le nombre de pages est atteint", async () => {
    const site = fakeSite({
      "https://example.com/robots.txt": { html: ALLOW_ALL },
      "https://example.com/": {
        html: `<a href="/1">1</a><a href="/2">2</a><a href="/3">3</a><a href="/4">4</a>`,
      },
      "https://example.com/1": { html: "" },
      "https://example.com/2": { html: "" },
      "https://example.com/3": { html: "" },
      "https://example.com/4": { html: "" },
    });

    const result = await run(site.fetch, "https://example.com/", { maxPages: 3 });

    expect(result.stopReason).toBe("maxPages");
    expect(result.truncated).toBe(true);
    expect(result.pages).toHaveLength(3);
    expect(pageCalls(site.calls)).toEqual([
      "https://example.com/",
      "https://example.com/1",
      "https://example.com/2",
    ]);
  });

  it("suit la pagination au même niveau, sans consommer de profondeur", async () => {
    const site = fakeSite({
      "https://example.com/robots.txt": { html: ALLOW_ALL },
      "https://example.com/": {
        html: `<a href="/?page=2" rel="next">Suivant</a><a href="/offres/1">offre</a>`,
      },
      "https://example.com/?page=2": { html: "page deux" },
      "https://example.com/offres/1": { html: "" },
    });

    const result = await run(site.fetch, "https://example.com/", { maxDepth: 0 });

    expect(pageByUrl(result, "https://example.com/?page=2")).toMatchObject({
      depth: 0,
      status: 200,
    });
    expect(pageByUrl(result, "https://example.com/offres/1")).toBeUndefined();
    expect(pageCalls(site.calls)).toEqual(["https://example.com/", "https://example.com/?page=2"]);
  });

  it("bascule sur le navigateur quand le HTML est vide mais scripté", async () => {
    const renderer: PageRenderer = {
      render: () => Promise.resolve({ html: "<p>rendu</p>", text: "rendu", status: 200 }),
      close: () => Promise.resolve(),
    };
    const site = fakeSite({
      "https://example.com/robots.txt": { html: ALLOW_ALL },
      "https://example.com/": { html: `<div id="app"></div><script src="app.js"></script>` },
    });

    const result = await run(site.fetch, "https://example.com/", {
      renderer,
      shouldRender: () => true,
    });

    const home = pageByUrl(result, "https://example.com/");
    expect(home?.text).toBe("rendu");
    expect(home?.html).toContain("rendu");
  });

  it("s'arrête quand la durée maximale est dépassée", async () => {
    const clock = { ms: 0 };
    const site = fakeSite(
      {
        "https://example.com/robots.txt": { html: ALLOW_ALL },
        "https://example.com/": { html: `<a href="/1">1</a>` },
        "https://example.com/1": { html: `<a href="/2">2</a>` },
        "https://example.com/2": { html: "" },
      },
      () => {
        clock.ms += 100;
      },
    );

    const result = await run(site.fetch, "https://example.com/", {
      maxRuntimeMs: 150,
      monotonicNow: () => clock.ms,
    });

    expect(result.stopReason).toBe("maxRuntime");
    expect(result.truncated).toBe(true);
  });
});
