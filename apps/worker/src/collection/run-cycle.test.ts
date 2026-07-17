import { AtsKind } from "@findit/database";
import type {
  CollectableSource,
  DiscoveredSource,
  JobSourceConnector,
  WebSearchQuery,
  WebSearchResult,
} from "@findit/job-connectors";
import { describe, expect, it, vi } from "vitest";

import type { CollectionJob, CollectionSummary } from "./run-collection.js";
import type { CycleDeps } from "./run-cycle.js";
import { runCycle, toDiscoveredSource } from "./run-cycle.js";

const result = (url: string): WebSearchResult => ({
  url,
  title: "Alternance - Développeur",
  description: "",
  host: new URL(url).host,
});

const greenhouseConnector: JobSourceConnector = {
  name: "greenhouse",
  atsKind: AtsKind.GREENHOUSE,
  minRequestIntervalMs: 0,
  collect: () => Promise.resolve([]),
};

const emptyCollection: CollectionSummary = {
  correlationId: "c",
  jobs: [],
  totalAccepted: 0,
  totalQuarantined: 0,
  totalRejected: 0,
};

const baseDeps = (over: Partial<CycleDeps> = {}): CycleDeps => ({
  search: () => Promise.resolve([]),
  registerSource: () => Promise.resolve({ registered: true }),
  listSources: () => Promise.resolve([]),
  collect: () => Promise.resolve(emptyCollection),
  connectorFor: (name) => (name === "greenhouse" ? greenhouseConnector : null),
  pace: () => Promise.resolve(),
  maxQueries: 2,
  searchIntervalMs: 1000,
  sourcePriority: 100,
  ...over,
});

describe("toDiscoveredSource", () => {
  it("reads the ATS kind from the connector and the host from the url", () => {
    expect(
      toDiscoveredSource({
        connectorName: "greenhouse",
        target: { atsIdentifier: "ivalua", companyName: "ivalua" },
        sourceUrls: ["https://boards.greenhouse.io/ivalua/jobs/1"],
      }),
    ).toEqual({
      connectorName: "greenhouse",
      atsKind: AtsKind.GREENHOUSE,
      atsIdentifier: "ivalua",
      atsHost: "boards.greenhouse.io",
    });
  });

  it("returns nothing for a connector that does not collect by token", () => {
    // Workable cherche un réseau entier : il ne passe pas par le registre.
    expect(
      toDiscoveredSource({
        connectorName: "workable",
        target: { atsIdentifier: "x", companyName: "x" },
        sourceUrls: ["https://jobs.workable.com/x"],
      }),
    ).toBeNull();
  });
});

describe("runCycle", () => {
  it("paces the searches but never before the first", async () => {
    const pace = vi.fn(() => Promise.resolve());
    const search = vi.fn<(q: WebSearchQuery) => Promise<readonly WebSearchResult[]>>(() =>
      Promise.resolve([]),
    );

    await runCycle(baseDeps({ maxQueries: 3, pace, search }));

    expect(search).toHaveBeenCalledTimes(3);
    expect(pace).toHaveBeenCalledTimes(2); // rien avant la première recherche
    expect(pace).toHaveBeenCalledWith(1000);
  });

  it("registers a discovered company, then collects from the register", async () => {
    const registered: DiscoveredSource[] = [];
    const collected: CollectionJob<unknown>[] = [];
    const sources: CollectableSource[] = [
      { connectorName: "greenhouse", atsIdentifier: "ivalua", companyName: "ivalua" },
    ];

    const summary = await runCycle(
      baseDeps({
        maxQueries: 1,
        search: () => Promise.resolve([result("https://boards.greenhouse.io/ivalua/jobs/1")]),
        registerSource: (source) => {
          registered.push(source);
          return Promise.resolve({ registered: true });
        },
        listSources: () => Promise.resolve(sources),
        collect: (jobs) => {
          collected.push(...jobs);
          return Promise.resolve({ ...emptyCollection, totalAccepted: 1 });
        },
      }),
    );

    expect(registered).toEqual([
      {
        connectorName: "greenhouse",
        atsKind: AtsKind.GREENHOUSE,
        atsIdentifier: "ivalua",
        atsHost: "boards.greenhouse.io",
      },
    ]);
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({ companyName: "ivalua", sourcePriority: 100 });
    expect(summary).toMatchObject({
      companiesDiscovered: 1,
      sourcesRegistered: 1,
      collection: { totalAccepted: 1 },
    });
  });

  it("skips a source whose connector is not available, without failing", async () => {
    const collected: CollectionJob<unknown>[] = [];

    await runCycle(
      baseDeps({
        listSources: () =>
          Promise.resolve([
            { connectorName: "greenhouse", atsIdentifier: "a", companyName: "a" },
            { connectorName: "retired", atsIdentifier: "b", companyName: "b" },
          ]),
        collect: (jobs) => {
          collected.push(...jobs);
          return Promise.resolve(emptyCollection);
        },
      }),
    );

    expect(collected).toHaveLength(1);
    expect(collected[0]?.target).toMatchObject({ atsIdentifier: "a" });
  });

  it("does not register a discovery from a network-search connector", async () => {
    const registerSource = vi.fn(() => Promise.resolve({ registered: true }));

    const summary = await runCycle(
      baseDeps({
        maxQueries: 1,
        search: () => Promise.resolve([result("https://jobs.workable.com/view/abc")]),
        registerSource,
      }),
    );

    expect(registerSource).not.toHaveBeenCalled();
    expect(summary.sourcesRegistered).toBe(0);
  });
});
