import { describe, expect, it } from "vitest";

import { parseApiEnv, parseDatabaseEnv, parseWebEnv, parseWorkerEnv } from "./env.js";

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
    const worker = parseWorkerEnv({
      REDIS_URL: required.REDIS_URL,
      DATABASE_URL: required.DATABASE_URL,
    });
    expect(worker.REDIS_URL).toBe(required.REDIS_URL);
    expect(parseWebEnv({ NEXT_PUBLIC_API_URL: "http://localhost:4000" }).NEXT_PUBLIC_API_URL).toBe(
      "http://localhost:4000/",
    );
  });

  it("defaults the collection schedule and treats the Brave key as optional", () => {
    const worker = parseWorkerEnv({
      REDIS_URL: required.REDIS_URL,
      DATABASE_URL: required.DATABASE_URL,
    });

    expect(worker.JOB_COLLECTION_CRON).toBe("0 */4 * * *");
    expect(worker.JOB_COLLECTION_TIMEZONE).toBe("Europe/Paris");
    expect(worker.WEB_SEARCH_MAX_QUERIES_PER_RUN).toBe(6);
    // Sans clé, la découverte est neutralisée - pas une erreur de configuration.
    expect(worker.BRAVE_SEARCH_API_KEY).toBeUndefined();
  });
});

describe("parseDatabaseEnv", () => {
  it("needs the database URL alone", () => {
    expect(parseDatabaseEnv({ DATABASE_URL: required.DATABASE_URL }).DATABASE_URL).toBe(
      required.DATABASE_URL,
    );
  });

  it("ignores settings that have nothing to do with the database", () => {
    expect(() => parseDatabaseEnv({ DATABASE_URL: required.DATABASE_URL })).not.toThrow();
    expect(() =>
      parseDatabaseEnv({ DATABASE_URL: required.DATABASE_URL, INTERNAL_API_KEY: "short" }),
    ).not.toThrow();
  });

  it("still rejects a missing or malformed database URL", () => {
    expect(() => parseDatabaseEnv({})).toThrow();
    expect(() => parseDatabaseEnv({ DATABASE_URL: "not-a-url" })).toThrow();
  });
});
