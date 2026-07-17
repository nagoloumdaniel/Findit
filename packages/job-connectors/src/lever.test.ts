import { AtsKind, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import type { CollectionTarget } from "./connector.js";
import { HttpRequestError } from "./http.js";
import { LEVER_CONNECTOR_NAME, LeverShapeError, leverConnector } from "./lever.js";
import type { RunConnectorDeps } from "./run.js";
import { runConnector } from "./run.js";

/*
 * Forme relevée sur la réponse réelle de
 * https://api.lever.co/v0/postings/spotify?mode=json le 2026-07-17.
 * Lever rend un tableau nu : ni enveloppe, ni total.
 */
const realPosting = {
  id: "66acb66f-de37-4d95-a353-874db92838ef",
  text: "Advertiser Solutions Vendor Lead - Programmatic and Direct Support",
  hostedUrl: "https://jobs.lever.co/spotify/66acb66f-de37-4d95-a353-874db92838ef",
  applyUrl: "https://jobs.lever.co/spotify/66acb66f-de37-4d95-a353-874db92838ef/apply",
  createdAt: 1781109739214,
  categories: {
    commitment: "Permanent",
    department: "Advertising",
    location: "London",
    team: "Advertising Sales",
    allLocations: ["London"],
  },
  workplaceType: "hybrid",
  country: "GB",
  description: "<div>\n<p>Support what you love.</p></div>",
  lists: [{ text: "What You'll Do", content: "\n<li>Work with vendor management</li>" }],
  additional: "<div>Spotify is an equal opportunity employer.</div>",
};

const target: CollectionTarget = { atsIdentifier: "spotify", companyName: "Spotify" };

const registration: ConnectorRegistration = {
  name: LEVER_CONNECTOR_NAME,
  accessStatus: SourceAccessStatus.PUBLIC_FEED,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-17T00:00:00.000Z"),
};

/** Rend une page par appel, dans l'ordre. */
const respondWithPages = (pages: readonly unknown[]) => {
  let call = 0;
  return vi.fn<typeof globalThis.fetch>(() => {
    const payload = pages[call] ?? [];
    call += 1;
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
};

const fullPage = (count: number): unknown[] =>
  Array.from({ length: count }, (_unused, index) => ({
    ...realPosting,
    id: `posting-${String(index)}`,
  }));

const deps = (fetchImpl: typeof globalThis.fetch, sleeps: number[] = []): RunConnectorDeps => ({
  fetch: fetchImpl,
  sleep: (ms: number) => {
    sleeps.push(ms);
    return Promise.resolve();
  },
  monotonicNow: () => 0,
  now: () => new Date("2026-07-17T12:00:00.000Z"),
  correlationId: "run-1",
});

describe("leverConnector", () => {
  it("declares the pace the source imposes, not a chosen one", () => {
    expect(leverConnector.name).toBe("lever");
    expect(leverConnector.atsKind).toBe(AtsKind.LEVER);
    expect(leverConnector.minRequestIntervalMs).toBe(1000);
  });

  it("waits a second between pages, as robots.txt demands", async () => {
    const sleeps: number[] = [];
    const fetchStub = respondWithPages([fullPage(100), fullPage(100), fullPage(7)]);

    const outcome = await runConnector(
      leverConnector,
      registration,
      target,
      deps(fetchStub, sleeps),
    );

    expect(outcome.requestCount).toBe(3);
    expect(outcome.jobs).toHaveLength(207);
    // Deux attentes pour trois requêtes : rien avant la première.
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("asks the documented endpoint and walks it with skip", async () => {
    const fetchStub = respondWithPages([fullPage(100), fullPage(1)]);

    await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual([
      "https://api.lever.co/v0/postings/spotify?mode=json&limit=100&skip=0",
      "https://api.lever.co/v0/postings/spotify?mode=json&limit=100&skip=100",
    ]);
  });

  it("stops on a short page instead of asking forever", async () => {
    const fetchStub = respondWithPages([[realPosting]]);

    const outcome = await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(fetchStub).toHaveBeenCalledOnce();
    expect(outcome.jobs).toHaveLength(1);
  });

  it("reads a real posting into a raw job, keeping the payload it came from", async () => {
    const fetchStub = respondWithPages([[realPosting]]);

    const outcome = await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]).toEqual({
      sourceJobId: "66acb66f-de37-4d95-a353-874db92838ef",
      url: "https://jobs.lever.co/spotify/66acb66f-de37-4d95-a353-874db92838ef",
      title: "Advertiser Solutions Vendor Lead - Programmatic and Direct Support",
      locationLabel: "London",
      descriptionHtml:
        "<div>\n<p>Support what you love.</p></div>\n" +
        "<h3>What You'll Do</h3><ul>\n<li>Work with vendor management</li></ul>\n" +
        "<div>Spotify is an equal opportunity employer.</div>",
      publishedAt: new Date(1781109739214),
      rawContent: JSON.stringify(realPosting),
      contentType: "application/json",
    });
  });

  it("keeps the requirements, which live outside the description field", async () => {
    const fetchStub = respondWithPages([[realPosting]]);

    const outcome = await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]?.descriptionHtml).toContain("Work with vendor management");
  });

  it("lets the source name a section, never mark it up", async () => {
    const fetchStub = respondWithPages([
      [{ ...realPosting, lists: [{ text: "<script>alert(1)</script>", content: "<li>a</li>" }] }],
    ]);

    const outcome = await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]?.descriptionHtml).toContain(
      "<h3>&lt;script&gt;alert(1)&lt;/script&gt;</h3>",
    );
    expect(outcome.jobs[0]?.descriptionHtml).not.toContain("<script>");
  });

  it("dates a posting from its creation stamp, in milliseconds", async () => {
    const fetchStub = respondWithPages([[realPosting]]);

    const outcome = await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]?.publishedAt?.toISOString()).toBe("2026-06-10T16:42:19.214Z");
  });

  it("leaves a posting undated rather than passing it off as fresh", async () => {
    const fetchStub = respondWithPages([
      [
        { ...realPosting, id: "a", createdAt: null },
        { ...realPosting, id: "b", createdAt: Number.NaN },
      ],
    ]);

    const outcome = await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs.map((job) => job.publishedAt)).toEqual([null, null]);
  });

  it("accepts a posting with no description, no list and no location", async () => {
    const fetchStub = respondWithPages([
      [
        {
          ...realPosting,
          description: null,
          lists: null,
          additional: null,
          categories: null,
        },
      ],
    ]);

    const outcome = await runConnector(leverConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]).toMatchObject({ descriptionHtml: null, locationLabel: null });
  });

  it("raises when a page is no longer a bare array", async () => {
    const fetchStub = respondWithPages([{ postings: [] }]);

    await expect(
      runConnector(leverConnector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(LeverShapeError);
  });

  it("names the offending posting by its position across pages", async () => {
    const fetchStub = respondWithPages([fullPage(100), [{ ...realPosting, id: undefined }]]);

    const run = runConnector(leverConnector, registration, target, deps(fetchStub));

    await expect(run).rejects.toBeInstanceOf(LeverShapeError);
    await expect(run).rejects.toThrowError(/l'offre à l'indice 100/);
  });

  it("refuses to truncate a board too large to walk", async () => {
    const fetchStub = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(fullPage(100)), { status: 200 })),
    );

    const run = runConnector(leverConnector, registration, target, deps(fetchStub));

    await expect(run).rejects.toBeInstanceOf(LeverShapeError);
    await expect(run).rejects.toThrowError(/liste amputée/);
  });

  it("surfaces an unknown company instead of reporting an empty board", async () => {
    const fetchStub = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: "Document not found" }), { status: 404 }),
      ),
    );

    await expect(
      runConnector(leverConnector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(HttpRequestError);
  });

  it("stays unrunnable while the registry does not allow it", async () => {
    const fetchStub = respondWithPages([[realPosting]]);

    await expect(
      runConnector(
        leverConnector,
        { ...registration, accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION },
        target,
        deps(fetchStub),
      ),
    ).rejects.toMatchObject({ reason: "ACCESS_STATUS_FORBIDS_COLLECTION" });

    expect(fetchStub).not.toHaveBeenCalled();
  });
});
