import { describe, expect, it } from "vitest";

import { parseApiEnv, parseWebEnv, parseWorkerEnv } from "./env.js";

const required = {
  DATABASE_URL: "postgresql://findit:findit@localhost:5432/findit",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_KEY: "local-development-key-change-me-0001",
};

describe("environment parsing", () => {
  it("coerces API settings", () => {
    const env = parseApiEnv({ ...required, API_PORT: "4000", RESUME_RETENTION_HOURS: "24" });
    expect(env.API_PORT).toBe(4000);
    expect(env.RESUME_RETENTION_HOURS).toBe(24);
  });

  it("normalizes the CORS origin without a trailing slash", () => {
    const env = parseApiEnv({ ...required, CORS_ORIGIN: "http://localhost:3000" });

    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
  });

  it("rejects a short internal API key", () => {
    expect(() => parseApiEnv({ ...required, INTERNAL_API_KEY: "short" })).toThrow();
  });

  it("parses worker and public web URLs", () => {
    expect(parseWorkerEnv({ REDIS_URL: required.REDIS_URL }).REDIS_URL).toBe(required.REDIS_URL);
    expect(parseWebEnv({ NEXT_PUBLIC_API_URL: "http://localhost:4000" }).NEXT_PUBLIC_API_URL).toBe(
      "http://localhost:4000/",
    );
  });
});
