import { AtsKind, ConnectorRunStatus, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ConnectorRegistration } from "./access-policy.js";
import type { ApifyConnectorConfig } from "./apify.js";
import { ApifyItemError, ApifyRunError, ApifyShapeError, createApifyConnector } from "./apify.js";
import type { JobSourceConnector, RawJob, SearchTarget } from "./connector.js";
import { FINDIT_USER_AGENT } from "./http.js";
import type { ClosedRun, ConnectorRunStore, RecordedError } from "./recorded-run.js";
import { runRecordedConnector } from "./recorded-run.js";
import type { RunConnectorDeps } from "./run.js";
import { BudgetGuardMissingError, BudgetRefusedError, runConnector } from "./run.js";
import { UnboundedRunError, createCycleBudget, usdToMicroUsd } from "./spend-budget.js";

const wallClock = new Date("2026-10-06T06:00:00.000Z");
const TOKEN = "faux-jeton-de-test";
const target: SearchTarget = { query: "alternance développeur", location: "Île-de-France, France" };

/** Tarifs fictifs d'un acteur de test : démarrage 50, résultat 300, détail 500 micro-dollars. */
const PRICING = { startMicroUsd: 50, perResultMicroUsd: 300, perDetailMicroUsd: 500 };
const EVENT_PRICES = { "actor-start": 50, result: 300, details: 500 };

/** Avec 3 résultats au plus : 50 + 3 x (300 + 500) = 2 450 micro-dollars. */
const WORST_CASE = 2450;

const itemSchema = z.object({ id: z.string(), title: z.string(), url: z.string() });

const mapItem = (item: unknown): RawJob => {
  const parsed = itemSchema.safeParse(item);
  if (!parsed.success) {
    throw new ApifyItemError("élément sans id, titre ou url");
  }
  return {
    sourceJobId: parsed.data.id,
    url: parsed.data.url,
    title: parsed.data.title,
    locationLabel: "Paris",
    descriptionHtml: null,
    publishedAt: wallClock,
    companyName: "Acme",
    rawContent: JSON.stringify(item),
    contentType: "application/json",
  };
};

const config = (overrides: Partial<ApifyConnectorConfig> = {}): ApifyConnectorConfig => ({
  name: "wttj",
  actorId: "someone/wttj-scraper",
  token: TOKEN,
  pricing: PRICING,
  eventPricesMicroUsd: EVENT_PRICES,
  maxItems: 3,
  maxItemsCeiling: 100,
  buildInput: (search, maxItems) => ({ query: search.query, maxItems }),
  mapItem,
  ...overrides,
});

interface OpenedRun {
  readonly id: string;
  closed: ClosedRun | null;
}

/** Journal des exécutions tenu en mémoire : même contrat que Prisma, sans base. */
class InMemoryRunStore implements ConnectorRunStore {
  readonly runs: OpenedRun[] = [];
  readonly errors: { runId: string | null; error: RecordedError }[] = [];
  readonly costs = new Map<string, number>();

  constructor(private readonly registration: ConnectorRegistration) {}

  loadRegistration(): Promise<ConnectorRegistration | null> {
    return Promise.resolve(this.registration);
  }
  openRun(): Promise<string> {
    const id = `run-${String(this.runs.length + 1)}`;
    this.runs.push({ id, closed: null });
    return Promise.resolve(id);
  }
  closeRun(runId: string, result: ClosedRun): Promise<void> {
    const run = this.runs.find((candidate) => candidate.id === runId);
    if (run === undefined) throw new Error(`Exécution inconnue : ${runId}`);
    run.closed = result;
    return Promise.resolve();
  }
  recordError(_connectorName: string, runId: string | null, error: RecordedError): Promise<void> {
    this.errors.push({ runId, error });
    return Promise.resolve();
  }
  recordDecisionCounts(): Promise<void> {
    return Promise.resolve();
  }
  recordCost(runId: string, costMicroUsd: number): Promise<void> {
    this.costs.set(runId, costMicroUsd);
    return Promise.resolve();
  }
  get totalCost(): number {
    return [...this.costs.values()].reduce((sum, cost) => sum + cost, 0);
  }
}

const registration = (): ConnectorRegistration => ({
  name: "wttj",
  accessStatus: SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-10-06T05:00:00.000Z"),
});

interface FakeRun {
  /** États successifs rendus aux sondages, dans l'ordre ; le dernier se répète. */
  readonly polls: readonly Record<string, unknown>[];
  readonly items: unknown;
}

interface SeenRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

const json = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/**
 * Faux serveur Apify : une doublure de test, nommée comme telle. Il répond aux
 * quatre appels que fait le connecteur et garde chaque requête reçue.
 */
const fakeApify = (run: FakeRun) => {
  const seen: SeenRequest[] = [];
  let polls = 0;

  const fetchImpl: typeof globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    seen.push({
      url,
      method,
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: typeof init?.body === "string" ? init.body : undefined,
    });

    if (method === "POST" && url.includes("/acts/")) {
      return Promise.resolve(
        json({ data: { id: "apify-run-1", status: "READY", defaultDatasetId: "dataset-1" } }),
      );
    }
    if (method === "POST" && url.includes("/abort")) {
      return Promise.resolve(json({ data: { id: "apify-run-1", status: "ABORTING" } }));
    }
    if (url.includes("/actor-runs/")) {
      const state = run.polls[Math.min(polls, run.polls.length - 1)];
      polls += 1;
      return Promise.resolve(
        json({ data: { id: "apify-run-1", defaultDatasetId: "dataset-1", ...state } }),
      );
    }
    if (url.includes("/datasets/")) {
      return Promise.resolve(json(run.items));
    }
    return Promise.resolve(new Response("introuvable", { status: 404 }));
  };

  return { fetchImpl, seen };
};

const goodItems = [
  { id: "a", title: "Alternance Front-end", url: "https://example.test/jobs/a" },
  { id: "b", title: "Alternance Back-end", url: "https://example.test/jobs/b" },
];

const succeeded = (
  counts: Record<string, number> | null = { "actor-start": 1, result: 2, details: 2 },
) => ({
  status: "SUCCEEDED",
  ...(counts === null ? {} : { chargedEventCounts: counts }),
});

const deps = (
  fetchImpl: typeof globalThis.fetch,
  store: InMemoryRunStore,
  monthBase = 0,
  withBudget = true,
): RunConnectorDeps => ({
  fetch: fetchImpl,
  sleep: () => Promise.resolve(),
  monotonicNow: () => 0,
  now: () => wallClock,
  correlationId: "correlation-apify",
  ...(withBudget
    ? {
        budget: createCycleBudget(
          { monthlyMicroUsd: usdToMicroUsd(4.5), cycleMicroUsd: usdToMicroUsd(0.15) },
          { monthToDateMicroUsd: () => Promise.resolve(monthBase + store.totalCost) },
        ),
      }
    : {}),
});

describe("createApifyConnector", () => {
  it("refuses a run that is not bounded, at construction", () => {
    expect(() => createApifyConnector(config({ maxItems: 0 }))).toThrow(UnboundedRunError);
    expect(() => createApifyConnector(config({ maxItems: 101 }))).toThrow(/dépasse le maximum/);
  });

  it("is a job-board connector whose worst case is declared before any call", () => {
    const connector = createApifyConnector(config());

    expect(connector.atsKind).toBe(AtsKind.JOB_BOARD);
    expect(connector.estimateCostMicroUsd?.(target)).toBe(WORST_CASE);
  });
});

describe("a paid connector through runRecordedConnector", () => {
  it("collects, records the real cost from the charged events, and keeps the token out of URLs", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({ polls: [{ status: "RUNNING" }, succeeded()], items: goodItems });

    const outcome = await runRecordedConnector(
      store,
      createApifyConnector(config()),
      target,
      deps(apify.fetchImpl, store),
    );

    expect(outcome.jobs.map((job) => job.sourceJobId)).toEqual(["a", "b"]);
    // 1 x 50 + 2 x 300 + 2 x 500 = 1 650 micro-dollars.
    expect(store.costs.get("run-1")).toBe(1650);
    expect(store.runs[0]?.closed?.status).toBe(ConnectorRunStatus.SUCCEEDED);

    const start = apify.seen[0];
    expect(start?.method).toBe("POST");
    expect(start?.url).toContain("/acts/someone~wttj-scraper/runs?maxTotalChargeUsd=0.00245");
    expect(JSON.parse(start?.body ?? "{}")).toEqual({ query: target.query, maxItems: 3 });
    expect(apify.seen.at(-1)?.url).toContain("/datasets/dataset-1/items");
    expect(apify.seen.at(-1)?.url).toContain("limit=3");

    for (const request of apify.seen) {
      expect(request.url).not.toContain(TOKEN);
      expect(request.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
      expect(request.headers["user-agent"]).toBe(FINDIT_USER_AGENT);
    }
  });

  it("re-reads the run once finished: counters that were stale at the first terminal poll do not under-report", async () => {
    const store = new InMemoryRunStore(registration());
    // Premier état terminal : seul le démarrage est compté. Relecture finale : tout l'est.
    const apify = fakeApify({
      polls: [
        { status: "RUNNING" },
        { status: "SUCCEEDED", chargedEventCounts: { "actor-start": 1 } },
        succeeded(),
      ],
      items: goodItems,
    });

    await runRecordedConnector(
      store,
      createApifyConnector(config()),
      target,
      deps(apify.fetchImpl, store),
    );

    expect(store.costs.get("run-1")).toBe(1650);
  });

  it("never records less than the received results cost, even if Apify never publishes its counters", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({
      polls: [{ status: "SUCCEEDED", chargedEventCounts: { "actor-start": 1 } }],
      items: goodItems,
    });

    await runRecordedConnector(
      store,
      createApifyConnector(config()),
      target,
      deps(apify.fetchImpl, store),
    );

    // 50 + 2 x (300 + 500) : le plancher des deux résultats reçus.
    expect(store.costs.get("run-1")).toBe(1650);
  });

  it("refuses to run without a budget guard, before any request", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({ polls: [succeeded()], items: goodItems });

    await expect(
      runRecordedConnector(
        store,
        createApifyConnector(config()),
        target,
        deps(apify.fetchImpl, store, 0, false),
      ),
    ).rejects.toBeInstanceOf(BudgetGuardMissingError);

    expect(apify.seen).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
  });

  it("refuses a run the month cannot afford: no request, no run, the refusal is recorded", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({ polls: [succeeded()], items: goodItems });

    await expect(
      runRecordedConnector(
        store,
        createApifyConnector(config()),
        target,
        deps(apify.fetchImpl, store, usdToMicroUsd(4.499)),
      ),
    ).rejects.toBeInstanceOf(BudgetRefusedError);

    expect(apify.seen).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
    expect(store.errors[0]?.error.kind).toBe("MONTH_BUDGET_EXCEEDED");
  });

  it("keeps the bill when the actor fails: cost recorded, run closed as failed", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({
      polls: [
        {
          status: "FAILED",
          statusMessage: "Site bloque",
          chargedEventCounts: { "actor-start": 1 },
        },
      ],
      items: [],
    });

    await expect(
      runRecordedConnector(
        store,
        createApifyConnector(config()),
        target,
        deps(apify.fetchImpl, store),
      ),
    ).rejects.toBeInstanceOf(ApifyRunError);

    expect(store.costs.get("run-1")).toBe(50);
    expect(store.runs[0]?.closed?.status).toBe(ConnectorRunStatus.FAILED);
    expect(store.errors.some((entry) => entry.error.message.includes("Site bloque"))).toBe(true);
  });

  it("aborts a run that never ends and counts the worst case", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({ polls: [{ status: "RUNNING" }], items: [] });

    await expect(
      runRecordedConnector(
        store,
        createApifyConnector(config({ maxPolls: 2 })),
        target,
        deps(apify.fetchImpl, store),
      ),
    ).rejects.toBeInstanceOf(ApifyRunError);

    expect(apify.seen.some((request) => request.url.endsWith("/abort"))).toBe(true);
    expect(store.costs.get("run-1")).toBe(WORST_CASE);
  });

  it("drops unreadable items with a recorded notice, and fails when none is readable", async () => {
    const store = new InMemoryRunStore(registration());
    const mixed = fakeApify({ polls: [succeeded()], items: [...goodItems, { id: "c" }] });

    const outcome = await runRecordedConnector(
      store,
      createApifyConnector(config()),
      target,
      deps(mixed.fetchImpl, store),
    );

    expect(outcome.jobs).toHaveLength(2);
    expect(
      store.errors.find((entry) => entry.error.kind === "ItemsDropped")?.error.message,
    ).toMatch(/1 élément\(s\) sur 3/);

    const store2 = new InMemoryRunStore(registration());
    const broken = fakeApify({ polls: [succeeded()], items: [{ nope: 1 }, { nope: 2 }] });
    await expect(
      runRecordedConnector(
        store2,
        createApifyConnector(config()),
        target,
        deps(broken.fetchImpl, store2),
      ),
    ).rejects.toBeInstanceOf(ApifyShapeError);
    // Les résultats ont été payés : le coût reste consigné malgré l'échec.
    expect(store2.costs.get("run-1")).toBe(1650);
  });

  it("falls back to the worst case when a charged event has no known price", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({
      polls: [succeeded({ "actor-start": 1, "surprise-event": 4 })],
      items: goodItems,
    });

    await runRecordedConnector(
      store,
      createApifyConnector(config()),
      target,
      deps(apify.fetchImpl, store),
    );

    expect(store.costs.get("run-1")).toBe(WORST_CASE);
    expect(store.errors.some((entry) => entry.error.kind === "CostUnknown")).toBe(true);
  });

  it("records the worst case when a paid connector reports no cost at all", async () => {
    const store = new InMemoryRunStore(registration());
    const silent: JobSourceConnector<SearchTarget> = {
      name: "wttj",
      atsKind: AtsKind.JOB_BOARD,
      minRequestIntervalMs: 0,
      estimateCostMicroUsd: () => 1234,
      collect: () => Promise.resolve([]),
    };

    await runRecordedConnector(
      store,
      silent,
      target,
      deps(fakeApify({ polls: [], items: [] }).fetchImpl, store),
    );

    expect(store.costs.get("run-1")).toBe(1234);
    expect(store.errors.some((entry) => entry.error.kind === "CostNotReported")).toBe(true);
  });

  it("does not let runConnector execute a paid connector without a budget authorization", async () => {
    const store = new InMemoryRunStore(registration());
    const apify = fakeApify({ polls: [succeeded()], items: goodItems });

    await expect(
      runConnector(
        createApifyConnector(config()),
        registration(),
        target,
        deps(apify.fetchImpl, store),
      ),
    ).rejects.toBeInstanceOf(BudgetGuardMissingError);

    expect(apify.seen).toHaveLength(0);
  });
});
