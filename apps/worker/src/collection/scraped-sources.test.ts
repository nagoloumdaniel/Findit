import { SOURCE_PRIORITY_JOB_BOARD } from "@findit/job-connectors";
import { describe, expect, it } from "vitest";

import { scrapedSourceJobs } from "./scraped-sources.js";

const env = (over: Partial<Parameters<typeof scrapedSourceJobs>[0]> = {}) => ({
  SCRAPED_SOURCES_ENABLED: true,
  APIFY_API_TOKEN: "faux-jeton-de-test",
  SCRAPING_WTTJ_MAX_ITEMS: 30,
  SCRAPING_HELLOWORK_MAX_ITEMS: 40,
  ...over,
});

describe("scrapedSourceJobs", () => {
  it("collects nothing while the switch is off, even with a token", () => {
    expect(scrapedSourceJobs(env({ SCRAPED_SOURCES_ENABLED: false }))).toEqual([]);
  });

  it("collects nothing without the Apify token, even with the switch on", () => {
    expect(scrapedSourceJobs(env({ APIFY_API_TOKEN: undefined }))).toEqual([]);
  });

  it("mounts both job boards, cheapest first, under the job-board rank and their caps", () => {
    const jobs = scrapedSourceJobs(env());

    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.connector.name).toBe("welcome-to-the-jungle");
    expect(jobs[1]?.connector.name).toBe("hellowork");
    for (const job of jobs) {
      expect(job.sourcePriority).toBe(SOURCE_PRIORITY_JOB_BOARD);
    }
    // WTTJ 30 : 50 + 30 x (300 + 500) = 24 050 ; HelloWork 40 : 50 + 40 x 950 = 38 050.
    expect(jobs[0]?.connector.estimateCostMicroUsd?.(jobs[0].target)).toBe(24_050);
    expect(jobs[1]?.connector.estimateCostMicroUsd?.(jobs[1].target)).toBe(38_050);
  });

  it("refuses a result cap above the absolute ceiling of a source", () => {
    expect(() => scrapedSourceJobs(env({ SCRAPING_WTTJ_MAX_ITEMS: 101 }))).toThrow(/maximum/);
    expect(() => scrapedSourceJobs(env({ SCRAPING_HELLOWORK_MAX_ITEMS: 101 }))).toThrow(/maximum/);
  });
});
