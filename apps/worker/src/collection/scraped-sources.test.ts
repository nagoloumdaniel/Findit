import { SOURCE_PRIORITY_JOB_BOARD } from "@findit/job-connectors";
import { describe, expect, it } from "vitest";

import { scrapedSourceJobs } from "./scraped-sources.js";

const env = (over: Partial<Parameters<typeof scrapedSourceJobs>[0]> = {}) => ({
  SCRAPED_SOURCES_ENABLED: true,
  APIFY_API_TOKEN: "faux-jeton-de-test",
  SCRAPING_WTTJ_MAX_ITEMS: 30,
  ...over,
});

describe("scrapedSourceJobs", () => {
  it("collects nothing while the switch is off, even with a token", () => {
    expect(scrapedSourceJobs(env({ SCRAPED_SOURCES_ENABLED: false }))).toEqual([]);
  });

  it("collects nothing without the Apify token, even with the switch on", () => {
    expect(scrapedSourceJobs(env({ APIFY_API_TOKEN: undefined }))).toEqual([]);
  });

  it("mounts Welcome to the Jungle with the job-board rank and the configured cap", () => {
    const jobs = scrapedSourceJobs(env({ SCRAPING_WTTJ_MAX_ITEMS: 20 }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.connector.name).toBe("welcome-to-the-jungle");
    expect(jobs[0]?.sourcePriority).toBe(SOURCE_PRIORITY_JOB_BOARD);
    // 50 + 20 x (300 + 500) micro-dollars : le plafond configuré est celui de l'estimation.
    expect(jobs[0]?.connector.estimateCostMicroUsd?.(jobs[0].target)).toBe(16_050);
  });

  it("refuses a result cap above the absolute ceiling of the source", () => {
    expect(() => scrapedSourceJobs(env({ SCRAPING_WTTJ_MAX_ITEMS: 101 }))).toThrow(/maximum/);
  });
});
