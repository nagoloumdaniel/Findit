import { SOURCE_PRIORITY_JOB_BOARD } from "@findit/job-connectors";
import { describe, expect, it } from "vitest";

import { scrapedSourceJobs } from "./scraped-sources.js";

const env = (over: Partial<Parameters<typeof scrapedSourceJobs>[0]> = {}) => ({
  SCRAPED_SOURCES_ENABLED: true,
  APIFY_API_TOKEN: "faux-jeton-de-test",
  SCRAPING_WTTJ_MAX_ITEMS: 30,
  SCRAPING_HELLOWORK_MAX_ITEMS: 40,
  SCRAPING_INDEED_MAX_ITEMS: 100,
  ...over,
});

describe("scrapedSourceJobs", () => {
  it("collects nothing while the switch is off, even with a token", () => {
    expect(scrapedSourceJobs(env({ SCRAPED_SOURCES_ENABLED: false }))).toEqual([]);
  });

  it("collects nothing without the Apify token, even with the switch on", () => {
    expect(scrapedSourceJobs(env({ APIFY_API_TOKEN: undefined }))).toEqual([]);
  });

  it("mounts the three job boards, cheapest first, under the job-board rank and their caps", () => {
    const jobs = scrapedSourceJobs(env());

    expect(jobs).toHaveLength(3);
    expect(jobs[0]?.connector.name).toBe("indeed");
    expect(jobs[1]?.connector.name).toBe("welcome-to-the-jungle");
    expect(jobs[2]?.connector.name).toBe("hellowork");
    for (const job of jobs) {
      expect(job.sourcePriority).toBe(SOURCE_PRIORITY_JOB_BOARD);
    }
    // Indeed 100 : 100 + 100 x 100 = 10 100 ; WTTJ 30 : 50 + 30 x (300 + 500) = 24 050 ;
    // HelloWork 40 : 50 + (40 + 20 de dépassement) x 950 = 57 050.
    expect(jobs[0]?.connector.estimateCostMicroUsd?.(jobs[0].target)).toBe(10_100);
    expect(jobs[1]?.connector.estimateCostMicroUsd?.(jobs[1].target)).toBe(24_050);
    expect(jobs[2]?.connector.estimateCostMicroUsd?.(jobs[2].target)).toBe(57_050);
  });

  it("refuses a result cap above the absolute ceiling of a source", () => {
    expect(() => scrapedSourceJobs(env({ SCRAPING_WTTJ_MAX_ITEMS: 101 }))).toThrow(/maximum/);
    expect(() => scrapedSourceJobs(env({ SCRAPING_HELLOWORK_MAX_ITEMS: 101 }))).toThrow(/maximum/);
    expect(() => scrapedSourceJobs(env({ SCRAPING_INDEED_MAX_ITEMS: 101 }))).toThrow(/maximum/);
  });
});
