import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_AGE_HOURS,
  EXTENDED_MAX_AGE_HOURS,
  ILE_DE_FRANCE_DEPARTMENTS,
  JOB_CONTRACTS,
  JOB_ROLE_CATEGORIES,
  JOB_WORK_MODES,
  publishedAfterFor,
} from "./job-scope.js";

describe("job scope", () => {
  it("contains exactly the validated contracts and roles", () => {
    expect(JOB_CONTRACTS).toEqual(["ALTERNANCE", "INTERNSHIP"]);
    expect(JOB_ROLE_CATEGORIES).toEqual([
      "FRONTEND",
      "BACKEND",
      "FULLSTACK",
      "MOBILE",
      "DATA_ANALYST",
      "DATA_ENGINEER",
    ]);
    expect(JOB_WORK_MODES).toEqual(["ONSITE", "HYBRID", "REMOTE"]);
  });

  it("uses the validated freshness windows", () => {
    expect(DEFAULT_MAX_AGE_HOURS).toBe(24);
    expect(EXTENDED_MAX_AGE_HOURS).toBe(72);
  });

  it("covers the eight Île-de-France departments and nothing else", () => {
    expect(ILE_DE_FRANCE_DEPARTMENTS).toEqual(["75", "77", "78", "91", "92", "93", "94", "95"]);
  });
});

describe("publishedAfterFor", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("bounds the default window to the last 24 hours", () => {
    expect(publishedAfterFor("LAST_24H", now).toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });

  it("bounds the extended window to the last 72 hours", () => {
    expect(publishedAfterFor("LAST_72H", now).toISOString()).toBe("2026-07-14T12:00:00.000Z");
  });

  it("never reaches further back than the extended window", () => {
    const oldest = Math.min(
      ...(["LAST_24H", "LAST_72H"] as const).map((window) =>
        publishedAfterFor(window, now).getTime(),
      ),
    );

    expect(now.getTime() - oldest).toBe(EXTENDED_MAX_AGE_HOURS * 60 * 60 * 1000);
  });
});
