import { AtsKind } from "@findit/database";
import type { JobSourceConnector } from "@findit/job-connectors";
import { describe, expect, it, vi } from "vitest";

import type { CollectionJob, CollectionSummary } from "./run-collection.js";
import { runScrapedCycle } from "./run-scraped-cycle.js";

const summary: CollectionSummary = {
  correlationId: "cycle-1",
  jobs: [],
  totalAccepted: 3,
  totalQuarantined: 0,
  totalRejected: 1,
};

const connector: JobSourceConnector = {
  name: "welcome-to-the-jungle",
  atsKind: AtsKind.JOB_BOARD,
  minRequestIntervalMs: 0,
  collect: () => Promise.resolve([]),
};

const job: CollectionJob<unknown> = {
  connector,
  target: { atsIdentifier: "x", companyName: "" },
  companyName: "",
  sourcePriority: 40,
};

describe("runScrapedCycle", () => {
  it("does nothing, and spends nothing, when no source is mounted", async () => {
    const collect = vi.fn().mockResolvedValue(summary);

    const result = await runScrapedCycle({ jobs: [], collect, correlationId: "cycle-0" });

    expect(collect).not.toHaveBeenCalled();
    expect(result).toEqual({
      correlationId: "cycle-0",
      jobs: [],
      totalAccepted: 0,
      totalQuarantined: 0,
      totalRejected: 0,
    });
  });

  it("hands the mounted sources to the collector, in the order given", async () => {
    const collect = vi.fn().mockResolvedValue(summary);
    const second = { ...job, companyName: "second" };

    const result = await runScrapedCycle({
      jobs: [job, second],
      collect,
      correlationId: "cycle-1",
    });

    expect(collect).toHaveBeenCalledWith([job, second]);
    expect(result).toBe(summary);
  });
});
