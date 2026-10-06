import { AtsKind, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import type {
  ClosedRun,
  ConnectorRegistration,
  ConnectorRunStore,
  DecisionCounts,
  JobSourceConnector,
  RawJob,
  RecordedError,
  RunConnectorDeps,
} from "@findit/job-connectors";
import type { CollectedOffer } from "@findit/job-pipeline";
import { describe, expect, it } from "vitest";

import type { CollectionJob, CollectionPersistence, PersistOutcome } from "./run-collection.js";
import { runCollection } from "./run-collection.js";

const NOW = new Date("2026-07-17T12:00:00.000Z");

/** Magasin en mémoire : le même contrat que Prisma, sans base. */
class FakeStore implements ConnectorRunStore {
  readonly closed: { runId: string; result: ClosedRun }[] = [];
  readonly counts = new Map<string, DecisionCounts>();
  readonly costs = new Map<string, number>();
  readonly errors: RecordedError[] = [];
  #next = 0;

  constructor(private readonly registration: ConnectorRegistration | null) {}

  loadRegistration(): Promise<ConnectorRegistration | null> {
    return Promise.resolve(this.registration);
  }
  openRun(): Promise<string> {
    this.#next += 1;
    return Promise.resolve(`run-${String(this.#next)}`);
  }
  closeRun(runId: string, result: ClosedRun): Promise<void> {
    this.closed.push({ runId, result });
    return Promise.resolve();
  }
  recordError(_c: string, _r: string | null, error: RecordedError): Promise<void> {
    this.errors.push(error);
    return Promise.resolve();
  }
  recordDecisionCounts(runId: string, counts: DecisionCounts): Promise<void> {
    this.counts.set(runId, counts);
    return Promise.resolve();
  }

  recordCost(runId: string, costMicroUsd: number): Promise<void> {
    this.costs.set(runId, costMicroUsd);
    return Promise.resolve();
  }
}

/** Persistance en mémoire : range chaque offre selon le sort qu'on lui a fixé. */
class FakePersistence implements CollectionPersistence {
  readonly seen: CollectedOffer[] = [];

  constructor(private readonly verdict: (offer: CollectedOffer) => PersistOutcome) {}

  persist(offer: CollectedOffer): Promise<PersistOutcome> {
    this.seen.push(offer);
    return Promise.resolve(this.verdict(offer));
  }
}

const registration: ConnectorRegistration = {
  name: "greenhouse",
  accessStatus: SourceAccessStatus.PUBLIC_FEED,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-17T09:00:00.000Z"),
};

const rawJob = (id: string, title: string): RawJob => ({
  sourceJobId: id,
  url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  title,
  locationLabel: "Paris, Île-de-France, France",
  descriptionHtml: "<p>x</p>",
  publishedAt: NOW,
  rawContent: "{}",
  contentType: "application/json",
});

describe("runCollection - employeur par offre", () => {
  it("uses the offer's own company for search results, and rejects unnamed ones", async () => {
    const store = new FakeStore({ ...registration, name: "workable" });
    const persistence = new FakePersistence(() => "created");

    const jobs: RawJob[] = [
      { ...rawJob("1", "Alternance Dev"), companyName: "Acme" },
      { ...rawJob("2", "Alternance Dev"), companyName: null },
    ];

    const job: CollectionJob<unknown> = {
      connector: connectorYielding(jobs, "workable"),
      target: { query: "alternance développeur", location: "Île-de-France, France" },
      // Repli vide : jamais un libellé de requête comme employeur.
      companyName: "",
      sourcePriority: 100,
    };

    const summary = await runCollection([job], deps(store, persistence));

    expect(persistence.seen).toHaveLength(1);
    expect(persistence.seen[0]?.companyName).toBe("Acme");
    expect(summary.jobs[0]).toMatchObject({ discovered: 2, accepted: 1, rejected: 1 });
  });
});

const connectorYielding = (jobs: readonly RawJob[], name = "greenhouse"): JobSourceConnector => ({
  name,
  atsKind: AtsKind.GREENHOUSE,
  minRequestIntervalMs: 0,
  collect: () => Promise.resolve(jobs),
});

const deps = (store: ConnectorRunStore, persistence: CollectionPersistence) => ({
  store,
  persistence,
  connectorDeps: {
    fetch: () => Promise.resolve(new Response("{}")),
    sleep: () => Promise.resolve(),
    monotonicNow: () => 0,
    now: () => NOW,
    correlationId: "run-corr",
  } satisfies RunConnectorDeps,
  now: () => NOW,
});

const job = (connector: JobSourceConnector, companyName: string): CollectionJob<unknown> => ({
  connector,
  target: { atsIdentifier: "acme", companyName },
  companyName,
  sourcePriority: 100,
});

describe("runCollection", () => {
  it("decides and persists every collected offer, and reports the tally", async () => {
    const store = new FakeStore(registration);
    const persistence = new FakePersistence((offer) =>
      offer.title.includes("Front") ? "created" : "rejected",
    );
    const connector = connectorYielding([
      rawJob("1", "Alternance Développeur Front-end"),
      rawJob("2", "Alternance Chargé de recrutement"),
    ]);

    const summary = await runCollection([job(connector, "Acme")], deps(store, persistence));

    expect(persistence.seen).toHaveLength(2);
    expect(summary.totalAccepted).toBe(1);
    expect(summary.totalRejected).toBe(1);
    expect(summary.jobs[0]).toMatchObject({
      discovered: 2,
      accepted: 1,
      rejected: 1,
      failed: false,
    });
  });

  it("writes the decision tally onto the run it belongs to", async () => {
    const store = new FakeStore(registration);
    const persistence = new FakePersistence(() => "created");
    const connector = connectorYielding([rawJob("1", "Front"), rawJob("2", "Front")]);

    await runCollection([job(connector, "Acme")], deps(store, persistence));

    expect(store.counts.get("run-1")).toEqual({
      jobsAccepted: 2,
      jobsQuarantined: 0,
      jobsRejected: 0,
    });
  });

  it("counts a quarantined offer apart from an accepted one", async () => {
    const store = new FakeStore(registration);
    const persistence = new FakePersistence((offer) =>
      offer.sourceJobId === "q" ? "quarantined" : "created",
    );
    const connector = connectorYielding([rawJob("a", "Front"), rawJob("q", "Front")]);

    const summary = await runCollection([job(connector, "Acme")], deps(store, persistence));

    expect(summary).toMatchObject({ totalAccepted: 1, totalQuarantined: 1 });
  });

  it("lets one source fail without stopping the others", async () => {
    const store = new FakeStore(registration);
    const persistence = new FakePersistence(() => "created");
    const failing = connectorYielding([], "greenhouse");
    const failingConnector: JobSourceConnector = {
      ...failing,
      collect: () => Promise.reject(new Error("la source a lâché")),
    };
    const working = connectorYielding([rawJob("1", "Front")]);

    const summary = await runCollection(
      [job(failingConnector, "Boom"), job(working, "Acme")],
      deps(store, persistence),
    );

    expect(summary.jobs[0]).toMatchObject({ failed: true, failureReason: "la source a lâché" });
    expect(summary.jobs[1]).toMatchObject({ failed: false, accepted: 1 });
    expect(summary.totalAccepted).toBe(1);
  });

  it("attaches the company name to the offers it hands on", async () => {
    const store = new FakeStore(registration);
    const persistence = new FakePersistence(() => "created");
    const connector = connectorYielding([rawJob("1", "Front")]);

    await runCollection([job(connector, "Ivalua")], deps(store, persistence));

    expect(persistence.seen[0]?.companyName).toBe("Ivalua");
    expect(persistence.seen[0]?.sourceName).toBe("greenhouse");
  });

  it("records a failed run without any decision counts", async () => {
    const store = new FakeStore(null); // registre vide → ConnectorNotRegisteredError
    const persistence = new FakePersistence(() => "created");
    const connector = connectorYielding([rawJob("1", "Front")]);

    const summary = await runCollection([job(connector, "Acme")], deps(store, persistence));

    expect(summary.jobs[0]?.failed).toBe(true);
    expect(store.counts.size).toBe(0);
  });
});
