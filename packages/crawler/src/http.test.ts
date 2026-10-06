import { describe, expect, it, vi } from "vitest";

import { FINDIT_USER_AGENT, HttpFetcher } from "./http.js";

/** Horloge et attente simulées : la cadence est vérifiée sans attendre vraiment. */
class FakeClock {
  ms = 0;
  readonly sleeps: number[] = [];

  readonly sleep = (waitMs: number): Promise<void> => {
    this.sleeps.push(waitMs);
    this.ms += waitMs;
    return Promise.resolve();
  };

  readonly monotonicNow = (): number => this.ms;
}

type FetchStub = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

const htmlOf = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;

/** Chaque réponse consomme `durationMs` sur l'horloge, comme une vraie requête. */
const respondWith = (clock: FakeClock, body: string, durationMs = 0): FetchStub =>
  vi.fn<typeof globalThis.fetch>(() => {
    clock.ms += durationMs;
    return Promise.resolve(
      new Response(htmlOf(body), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
  });

const fetcherWith = (clock: FakeClock, fetchStub: FetchStub, minRequestIntervalMs = 1000) =>
  new HttpFetcher({
    userAgent: FINDIT_USER_AGENT,
    minRequestIntervalMs,
    fetch: fetchStub,
    sleep: clock.sleep,
    monotonicNow: clock.monotonicNow,
  });

describe("HttpFetcher", () => {
  it("annonce le user-agent de Findit sur chaque requête", async () => {
    const clock = new FakeClock();
    const fetchStub = respondWith(clock, "offres");
    const fetcher = fetcherWith(clock, fetchStub);

    await fetcher.get("https://example.com/offres");

    expect(fetchStub).toHaveBeenCalledWith(
      "https://example.com/offres",
      expect.objectContaining({
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": FINDIT_USER_AGENT },
        redirect: "follow",
      }),
    );
  });

  it("rend le HTML, le statut et l'URL finale", async () => {
    const clock = new FakeClock();
    const fetcher = fetcherWith(clock, respondWith(clock, "bonjour"));

    const page = await fetcher.get("https://example.com/");

    expect(page.status).toBe(200);
    expect(page.html).toContain("bonjour");
    expect(fetcher.requestCount).toBe(1);
  });

  it("ne jette pas sur un statut d'erreur : il le rapporte", async () => {
    const clock = new FakeClock();
    const fetchStub = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response("introuvable", { status: 404 })),
    );
    const fetcher = fetcherWith(clock, fetchStub);

    await expect(fetcher.get("https://example.com/absent")).resolves.toMatchObject({
      status: 404,
    });
  });

  it("n'attend pas avant la première requête", async () => {
    const clock = new FakeClock();
    const fetcher = fetcherWith(clock, respondWith(clock, "x"));

    await fetcher.get("https://example.com/1");

    expect(clock.sleeps).toEqual([]);
  });

  it("tient la cadence entre la fin d'une requête et la suivante", async () => {
    const clock = new FakeClock();
    const fetcher = fetcherWith(clock, respondWith(clock, "x", 200), 1000);

    await fetcher.get("https://example.com/1");
    await fetcher.get("https://example.com/2");

    expect(clock.sleeps).toEqual([1000]);
  });

  it("respecte une cadence plus lente imposée pour un domaine", async () => {
    const clock = new FakeClock();
    const fetcher = fetcherWith(clock, respondWith(clock, "x", 200), 1000);

    // Chaque requête de ce domaine porte son Crawl-delay annoncé (5000 ms).
    await fetcher.get("https://example.com/1", 5000);
    await fetcher.get("https://example.com/2", 5000);

    expect(clock.sleeps).toEqual([5000]);
  });

  it("tient la cadence même quand plusieurs requêtes partent ensemble", async () => {
    const clock = new FakeClock();
    const fetchStub = respondWith(clock, "x", 200);
    const fetcher = fetcherWith(clock, fetchStub, 1000);

    await Promise.all([
      fetcher.get("https://example.com/1"),
      fetcher.get("https://example.com/2"),
      fetcher.get("https://example.com/3"),
    ]);

    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(clock.sleeps).toEqual([1000, 1000]);
  });
});
