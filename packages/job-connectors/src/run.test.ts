import { AtsKind, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import type { CollectionTarget, JobSourceConnector, RawJob } from "./connector.js";
import type { CollectionPermit } from "./permit.js";
import type { RunConnectorDeps } from "./run.js";
import { CollectionRefusedError, runConnector } from "./run.js";

const wallClock = new Date("2026-07-17T12:00:00.000Z");

const target: CollectionTarget = { atsIdentifier: "acme", companyName: "Acme" };

const registration = (overrides: Partial<ConnectorRegistration> = {}): ConnectorRegistration => ({
  name: "greenhouse",
  accessStatus: SourceAccessStatus.PUBLIC_FEED,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-17T09:00:00.000Z"),
  ...overrides,
});

const deps = (fetchImpl: typeof globalThis.fetch): RunConnectorDeps => {
  let clock = 0;
  return {
    fetch: fetchImpl,
    sleep: (ms: number) => {
      clock += ms;
      return Promise.resolve();
    },
    monotonicNow: () => clock,
    now: () => wallClock,
    correlationId: "run-1",
  };
};

const emptyFetch: typeof globalThis.fetch = () =>
  Promise.resolve(new Response("[]", { status: 200 }));

const rawJob: RawJob = {
  sourceJobId: "42",
  url: "https://boards.greenhouse.io/acme/jobs/42",
  title: "Alternance Front-end",
  locationLabel: "Paris",
  descriptionHtml: "<p>Poste</p>",
  publishedAt: wallClock,
  rawContent: '{"id":42}',
  contentType: "application/json",
};

const connectorReturning = (
  jobs: readonly RawJob[],
  overrides: Partial<JobSourceConnector> = {},
): JobSourceConnector => ({
  name: "greenhouse",
  atsKind: AtsKind.GREENHOUSE,
  minRequestIntervalMs: 1000,
  collect: () => Promise.resolve(jobs),
  ...overrides,
});

describe("runConnector", () => {
  it("collects and reports what the run did", async () => {
    const fetchStub = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 })),
    );
    const connector = connectorReturning([rawJob], {
      collect: async (_permit, collectionTarget, context) => {
        await context.fetchJson(
          `https://boards-api.greenhouse.io/v1/boards/${collectionTarget.atsIdentifier}/jobs`,
        );
        return [rawJob];
      },
    });

    const outcome = await runConnector(connector, registration(), target, deps(fetchStub));

    expect(outcome).toEqual({
      connectorName: "greenhouse",
      target,
      jobs: [rawJob],
      requestCount: 1,
      startedAt: wallClock,
      finishedAt: wallClock,
    });
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it("hands the connector a permit that names the regime it was granted under", async () => {
    let seen: CollectionPermit | null = null;
    const connector = connectorReturning([], {
      collect: (permit) => {
        seen = permit;
        return Promise.resolve([]);
      },
    });

    await runConnector(connector, registration(), target, deps(emptyFetch));

    expect(seen).toMatchObject({
      connectorName: "greenhouse",
      accessStatus: SourceAccessStatus.PUBLIC_FEED,
      grantedAt: wallClock,
      granted: true,
    });
  });

  it("refuses a source awaiting permission, and never reaches the network", async () => {
    const collect = vi.fn<JobSourceConnector["collect"]>();
    const fetchStub = vi.fn<typeof globalThis.fetch>(emptyFetch);
    const connector = connectorReturning([], {
      name: "ashby",
      atsKind: AtsKind.ASHBY,
      collect,
    });

    await expect(
      runConnector(
        connector,
        registration({
          name: "ashby",
          accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
        }),
        target,
        deps(fetchStub),
      ),
    ).rejects.toMatchObject({
      name: "CollectionRefusedError",
      connectorName: "ashby",
      reason: "ACCESS_STATUS_FORBIDS_COLLECTION",
    });

    expect(collect).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("refuses a disabled connector even under an allowed regime", async () => {
    const collect = vi.fn<JobSourceConnector["collect"]>();
    const connector = connectorReturning([], { collect });

    await expect(
      runConnector(
        connector,
        registration({ status: ConnectorStatus.DISABLED }),
        target,
        deps(emptyFetch),
      ),
    ).rejects.toBeInstanceOf(CollectionRefusedError);

    expect(collect).not.toHaveBeenCalled();
  });

  it("refuses a connector presented with another source's registration", async () => {
    const collect = vi.fn<JobSourceConnector["collect"]>();
    const connector = connectorReturning([], { collect });

    await expect(
      runConnector(connector, registration({ name: "lever" }), target, deps(emptyFetch)),
    ).rejects.toMatchObject({ reason: "REGISTRATION_MISMATCH" });

    expect(collect).not.toHaveBeenCalled();
  });

  it("applies the connector's announced pace to the requests it makes", async () => {
    const sleeps: number[] = [];
    const fetchStub = vi.fn<typeof globalThis.fetch>(emptyFetch);
    const connector = connectorReturning([], {
      name: "lever",
      atsKind: AtsKind.LEVER,
      minRequestIntervalMs: 1000,
      collect: async (_permit, _collectionTarget, context) => {
        await context.fetchJson("https://api.lever.co/v0/postings/acme?mode=json");
        await context.fetchJson("https://api.lever.co/v0/postings/acme?mode=json&skip=100");
        return [];
      },
    });

    const runDeps: RunConnectorDeps = {
      ...deps(fetchStub),
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    };

    const outcome = await runConnector(connector, registration({ name: "lever" }), target, runDeps);

    expect(sleeps).toEqual([1000]);
    expect(outcome.requestCount).toBe(2);
  });
});
