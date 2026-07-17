import { describe, expect, it, vi } from "vitest";

import { FINDIT_USER_AGENT, HttpRequestError, ThrottledJsonClient } from "./http.js";

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

/** Chaque réponse consomme `durationMs` sur l'horloge, comme une vraie requête. */
const respondWith = (clock: FakeClock, body: unknown, durationMs = 0): FetchStub =>
  vi.fn<typeof globalThis.fetch>(() => {
    clock.ms += durationMs;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

const clientWith = (clock: FakeClock, fetchStub: FetchStub, minRequestIntervalMs = 1000) =>
  new ThrottledJsonClient({
    minRequestIntervalMs,
    fetch: fetchStub,
    sleep: clock.sleep,
    monotonicNow: clock.monotonicNow,
  });

describe("ThrottledJsonClient", () => {
  it("announces the Findit user-agent on every request", async () => {
    const clock = new FakeClock();
    const fetchStub = respondWith(clock, { jobs: [] });
    const client = clientWith(clock, fetchStub);

    await client.fetchJson("https://boards-api.greenhouse.io/v1/boards/acme/jobs");

    expect(fetchStub).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      expect.objectContaining({
        headers: { "user-agent": FINDIT_USER_AGENT, accept: "application/json" },
      }),
    );
  });

  it("returns the parsed payload and counts the request", async () => {
    const clock = new FakeClock();
    const client = clientWith(clock, respondWith(clock, { jobs: [{ id: 1 }] }));

    await expect(client.fetchJson("https://example.test/jobs")).resolves.toEqual({
      jobs: [{ id: 1 }],
    });
    expect(client.requestCount).toBe(1);
  });

  it("raises the HTTP status rather than returning an empty result", async () => {
    const clock = new FakeClock();
    const fetchStub = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response("not found", { status: 404 })),
    );
    const client = clientWith(clock, fetchStub);

    await expect(client.fetchJson("https://example.test/missing")).rejects.toMatchObject({
      name: "HttpRequestError",
      httpStatus: 404,
      url: "https://example.test/missing",
    });
    await expect(client.fetchJson("https://example.test/missing")).rejects.toBeInstanceOf(
      HttpRequestError,
    );
  });

  it("does not wait before the first request", async () => {
    const clock = new FakeClock();
    const client = clientWith(clock, respondWith(clock, {}));

    await client.fetchJson("https://example.test/1");

    expect(clock.sleeps).toEqual([]);
  });

  it("waits the announced crawl delay between the end of a request and the next", async () => {
    const clock = new FakeClock();
    const client = clientWith(clock, respondWith(clock, {}, 200), 1000);

    await client.fetchJson("https://api.lever.co/v0/postings/acme?mode=json");
    await client.fetchJson("https://api.lever.co/v0/postings/acme?mode=json&skip=100");

    expect(clock.sleeps).toEqual([1000]);
  });

  it("holds the delay even when a connector fires its requests at once", async () => {
    const clock = new FakeClock();
    const fetchStub = respondWith(clock, {}, 200);
    const client = clientWith(clock, fetchStub, 1000);

    await Promise.all([
      client.fetchJson("https://example.test/1"),
      client.fetchJson("https://example.test/2"),
      client.fetchJson("https://example.test/3"),
    ]);

    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(clock.sleeps).toEqual([1000, 1000]);
    expect(client.requestCount).toBe(3);
  });

  it("keeps the pace after a failed request instead of hammering the source", async () => {
    const clock = new FakeClock();
    const fetchStub = vi.fn<typeof globalThis.fetch>(() => {
      clock.ms += 200;
      return Promise.resolve(new Response("boom", { status: 500 }));
    });
    const client = clientWith(clock, fetchStub, 1000);

    await expect(client.fetchJson("https://example.test/1")).rejects.toBeInstanceOf(
      HttpRequestError,
    );
    await expect(client.fetchJson("https://example.test/2")).rejects.toBeInstanceOf(
      HttpRequestError,
    );

    expect(clock.sleeps).toEqual([1000]);
  });
});
