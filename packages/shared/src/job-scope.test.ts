import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_AGE_HOURS,
  EXTENDED_MAX_AGE_HOURS,
  JOB_CONTRACTS,
  JOB_ROLE_CATEGORIES,
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
  });

  it("uses the validated freshness windows", () => {
    expect(DEFAULT_MAX_AGE_HOURS).toBe(24);
    expect(EXTENDED_MAX_AGE_HOURS).toBe(72);
  });
});
