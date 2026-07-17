import { AtsKind, ConnectorRunStatus, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import type { CollectionTarget, JobSourceConnector, RawJob } from "./connector.js";
import { HttpRequestError } from "./http.js";
import type {
  ClosedRun,
  ConnectorRunStore,
  DecisionCounts,
  RecordedError,
} from "./recorded-run.js";
import { ConnectorNotRegisteredError, runRecordedConnector } from "./recorded-run.js";
import type { RunConnectorDeps } from "./run.js";
import { CollectionRefusedError } from "./run.js";

const wallClock = new Date("2026-07-17T12:00:00.000Z");
const target: CollectionTarget = { atsIdentifier: "acme", companyName: "Acme" };

const rawJob: RawJob = {
  sourceJobId: "1",
  url: "https://example.test/jobs/1",
  title: "Alternance Back-end",
  locationLabel: "Paris",
  descriptionHtml: "<p>Poste</p>",
  publishedAt: wallClock,
  rawContent: "{}",
  contentType: "application/json",
};

interface OpenedRun {
  readonly id: string;
  readonly connectorName: string;
  readonly correlationId: string;
  readonly startedAt: Date;
  closed: ClosedRun | null;
}

interface StoredError {
  readonly connectorName: string;
  readonly runId: string | null;
  readonly error: RecordedError;
}

/**
 * Une implémentation complète du magasin, tenue en mémoire. Elle n'imite pas
 * Prisma : elle applique le même contrat, ce qui rend l'enchaînement
 * vérifiable sans base.
 */
class InMemoryRunStore implements ConnectorRunStore {
  readonly runs: OpenedRun[] = [];
  readonly errors: StoredError[] = [];
  readonly decisionCounts = new Map<string, DecisionCounts>();

  constructor(private readonly registration: ConnectorRegistration | null) {}

  loadRegistration(): Promise<ConnectorRegistration | null> {
    return Promise.resolve(this.registration);
  }

  openRun(connectorName: string, correlationId: string, startedAt: Date): Promise<string> {
    const id = `run-${String(this.runs.length + 1)}`;
    this.runs.push({ id, connectorName, correlationId, startedAt, closed: null });
    return Promise.resolve(id);
  }

  closeRun(runId: string, result: ClosedRun): Promise<void> {
    const run = this.runs.find((candidate) => candidate.id === runId);
    if (run === undefined) {
      throw new Error(`Exécution inconnue : ${runId}`);
    }

    run.closed = result;
    return Promise.resolve();
  }

  recordError(connectorName: string, runId: string | null, error: RecordedError): Promise<void> {
    this.errors.push({ connectorName, runId, error });
    return Promise.resolve();
  }

  recordDecisionCounts(runId: string, counts: DecisionCounts): Promise<void> {
    this.decisionCounts.set(runId, counts);
    return Promise.resolve();
  }
}

const registration = (overrides: Partial<ConnectorRegistration> = {}): ConnectorRegistration => ({
  name: "greenhouse",
  accessStatus: SourceAccessStatus.PUBLIC_FEED,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-17T09:00:00.000Z"),
  ...overrides,
});

const okFetch: typeof globalThis.fetch = () => Promise.resolve(new Response("{}", { status: 200 }));

const deps = (fetchImpl: typeof globalThis.fetch = okFetch): RunConnectorDeps => ({
  fetch: fetchImpl,
  sleep: () => Promise.resolve(),
  monotonicNow: () => 0,
  now: () => wallClock,
  correlationId: "correlation-42",
});

const connectorThat = (
  collect: JobSourceConnector["collect"],
  name = "greenhouse",
): JobSourceConnector => ({
  name,
  atsKind: AtsKind.GREENHOUSE,
  minRequestIntervalMs: 1000,
  collect,
});

describe("runRecordedConnector", () => {
  it("records a successful run with what it actually did", async () => {
    const store = new InMemoryRunStore(registration());
    const connector = connectorThat(async (_permit, _target, context) => {
      await context.fetchJson("https://example.test/page/1");
      await context.fetchJson("https://example.test/page/2");
      return [rawJob, { ...rawJob, sourceJobId: "2" }];
    });

    await runRecordedConnector(store, connector, target, deps());

    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({
      connectorName: "greenhouse",
      correlationId: "correlation-42",
      startedAt: wallClock,
      closed: {
        status: ConnectorRunStatus.SUCCEEDED,
        finishedAt: wallClock,
        pagesFetched: 2,
        jobsDiscovered: 2,
        errorCount: 0,
      },
    });
    expect(store.errors).toEqual([]);
  });

  it("opens the run before collecting, so a crashed process leaves a trace", async () => {
    const store = new InMemoryRunStore(registration());
    let openWhenCollecting: number | null = null;
    const connector = connectorThat(() => {
      openWhenCollecting = store.runs.filter((run) => run.closed === null).length;
      return Promise.resolve([]);
    });

    await runRecordedConnector(store, connector, target, deps());

    expect(openWhenCollecting).toBe(1);
  });

  it("closes a failed run and keeps the pages it had already fetched", async () => {
    const store = new InMemoryRunStore(registration());
    const connector = connectorThat(async (_permit, _target, context) => {
      await context.fetchJson("https://example.test/page/1");
      await context.fetchJson("https://example.test/page/2");
      throw new Error("la source a changé de forme");
    });

    await expect(runRecordedConnector(store, connector, target, deps())).rejects.toThrowError(
      "la source a changé de forme",
    );

    expect(store.runs[0]?.closed).toMatchObject({
      status: ConnectorRunStatus.FAILED,
      pagesFetched: 2,
      jobsDiscovered: 0,
      errorCount: 1,
    });
  });

  it("records the failure against the run it belongs to", async () => {
    const store = new InMemoryRunStore(registration());
    const connector = connectorThat(() => {
      throw new HttpRequestError("https://example.test/jobs", 503);
    });

    await expect(runRecordedConnector(store, connector, target, deps())).rejects.toBeInstanceOf(
      HttpRequestError,
    );

    expect(store.errors).toEqual([
      {
        connectorName: "greenhouse",
        runId: "run-1",
        error: {
          kind: "HttpRequestError",
          message: "La source a répondu 503 sur https://example.test/jobs.",
          url: "https://example.test/jobs",
        },
      },
    ]);
  });

  it("records a refusal without opening a run, because a refusal is not a run", async () => {
    const store = new InMemoryRunStore(
      registration({ accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION }),
    );
    const connector = connectorThat(() => Promise.resolve([rawJob]));

    await expect(runRecordedConnector(store, connector, target, deps())).rejects.toBeInstanceOf(
      CollectionRefusedError,
    );

    expect(store.runs).toEqual([]);
    expect(store.errors).toEqual([
      {
        connectorName: "greenhouse",
        runId: null,
        error: {
          kind: "ACCESS_STATUS_FORBIDS_COLLECTION",
          message:
            "Le régime d'accès DISABLED_PENDING_PERMISSION n'autorise pas la collecte directe.",
          url: null,
        },
      },
    ]);
  });

  it("never reaches the source when the registry refuses", async () => {
    const store = new InMemoryRunStore(registration({ status: ConnectorStatus.FAILING }));
    let collected = false;
    const connector = connectorThat(() => {
      collected = true;
      return Promise.resolve([]);
    });

    await expect(runRecordedConnector(store, connector, target, deps())).rejects.toBeInstanceOf(
      CollectionRefusedError,
    );

    expect(collected).toBe(false);
  });

  it("refuses a connector the registry has never heard of", async () => {
    const store = new InMemoryRunStore(null);
    const connector = connectorThat(() => Promise.resolve([rawJob]), "inconnu");

    await expect(runRecordedConnector(store, connector, target, deps())).rejects.toBeInstanceOf(
      ConnectorNotRegisteredError,
    );

    expect(store.runs).toEqual([]);
    expect(store.errors).toEqual([]);
  });

  it("reads the registry on every run, so a revoked source stops at the next one", async () => {
    const allowed = new InMemoryRunStore(registration());
    const revoked = new InMemoryRunStore(
      registration({ status: ConnectorStatus.DISABLED_PENDING_PERMISSION }),
    );
    const connector = connectorThat(() => Promise.resolve([rawJob]));

    await expect(runRecordedConnector(allowed, connector, target, deps())).resolves.toMatchObject({
      jobs: [rawJob],
    });
    await expect(runRecordedConnector(revoked, connector, target, deps())).rejects.toBeInstanceOf(
      CollectionRefusedError,
    );
  });
});
