import { describe, expect, it } from "vitest";

import { parseApiEnv, parseDatabaseEnv, parseWebEnv, parseWorkerEnv } from "./env.js";

const required = {
  DATABASE_URL: "postgresql://findit:findit@localhost:5432/findit",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_KEY: "local-development-key-change-me-0001",
  DEEPSEEK_API_KEY: "cle-de-test-deepseek",
};

describe("environment parsing", () => {
  it("coerces API settings", () => {
    const env = parseApiEnv({ ...required, API_PORT: "4000" });
    expect(env.API_PORT).toBe(4000);
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

  it("accepts a remote database URL that requires TLS", () => {
    const url = "postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require";
    expect(parseDatabaseEnv({ DATABASE_URL: url }).DATABASE_URL).toContain("sslmode=require");
  });

  it("refuses a remote database URL without TLS, without echoing the URL", () => {
    const url = "postgresql://u:supersecret@ep-x.neon.tech/neondb";
    let message = "";
    try {
      parseDatabaseEnv({ DATABASE_URL: url });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("sslmode=require");
    expect(message).not.toContain("supersecret");
  });

  it("keeps a local database URL usable without TLS", () => {
    expect(parseDatabaseEnv({ DATABASE_URL: required.DATABASE_URL }).DATABASE_URL).toBe(
      required.DATABASE_URL,
    );
  });

  it("applies the TLS rule to the API and worker too", () => {
    const remote = "postgresql://u:p@ep-x.neon.tech/neondb";
    expect(() => parseApiEnv({ ...required, DATABASE_URL: remote })).toThrow();
    expect(() => parseWorkerEnv({ REDIS_URL: required.REDIS_URL, DATABASE_URL: remote })).toThrow();
  });

  it("defaults the scraping budget to the free Apify plan with a safety margin", () => {
    const worker = parseWorkerEnv({
      REDIS_URL: required.REDIS_URL,
      DATABASE_URL: required.DATABASE_URL,
    });

    expect(worker.SCRAPING_BUDGET_MONTHLY_USD).toBe(4.5);
    expect(worker.SCRAPING_BUDGET_CYCLE_USD).toBe(0.15);
  });

  it("reads a custom budget and refuses a negative one", () => {
    const base = { REDIS_URL: required.REDIS_URL, DATABASE_URL: required.DATABASE_URL };

    expect(
      parseWorkerEnv({
        ...base,
        SCRAPING_BUDGET_MONTHLY_USD: "17",
        SCRAPING_BUDGET_CYCLE_USD: "0.6",
      }),
    ).toMatchObject({ SCRAPING_BUDGET_MONTHLY_USD: 17, SCRAPING_BUDGET_CYCLE_USD: 0.6 });
    expect(() => parseWorkerEnv({ ...base, SCRAPING_BUDGET_MONTHLY_USD: "-1" })).toThrow();
    expect(() => parseWorkerEnv({ ...base, SCRAPING_BUDGET_CYCLE_USD: "abc" })).toThrow();
  });

  it("keeps the scraped-sources cycle off by default, daily at 6 am, 30 results per run", () => {
    const worker = parseWorkerEnv({
      REDIS_URL: required.REDIS_URL,
      DATABASE_URL: required.DATABASE_URL,
    });

    expect(worker.SCRAPED_SOURCES_ENABLED).toBe(false);
    expect(worker.SCRAPED_COLLECTION_CRON).toBe("0 6 * * *");
    expect(worker.SCRAPING_WTTJ_MAX_ITEMS).toBe(30);
    expect(worker.SCRAPING_HELLOWORK_MAX_ITEMS).toBe(40);
    expect(worker.SCRAPING_INDEED_MAX_ITEMS).toBe(100);
  });

  it("keeps the autonomous agent off by default, daily at 8 am, with a default objective", () => {
    const worker = parseWorkerEnv({
      REDIS_URL: required.REDIS_URL,
      DATABASE_URL: required.DATABASE_URL,
    });

    expect(worker.AGENT_RUN_ENABLED).toBe(false);
    expect(worker.AGENT_COLLECTION_CRON).toBe("0 8 * * *");
    expect(worker.AGENT_OBJECTIVE).toBe("alternance et stage développeur en Île-de-France");
    expect(worker.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it("turns the scraped-sources cycle on only with an explicit true, and bounds the result cap", () => {
    const base = { REDIS_URL: required.REDIS_URL, DATABASE_URL: required.DATABASE_URL };

    expect(
      parseWorkerEnv({ ...base, SCRAPED_SOURCES_ENABLED: "true" }).SCRAPED_SOURCES_ENABLED,
    ).toBe(true);
    expect(parseWorkerEnv({ ...base, SCRAPED_SOURCES_ENABLED: "1" }).SCRAPED_SOURCES_ENABLED).toBe(
      false,
    );
    expect(() => parseWorkerEnv({ ...base, SCRAPING_WTTJ_MAX_ITEMS: "0" })).toThrow();
    expect(() => parseWorkerEnv({ ...base, SCRAPING_WTTJ_MAX_ITEMS: "101" })).toThrow();
    expect(() => parseWorkerEnv({ ...base, SCRAPING_HELLOWORK_MAX_ITEMS: "0" })).toThrow();
    expect(() => parseWorkerEnv({ ...base, SCRAPING_HELLOWORK_MAX_ITEMS: "101" })).toThrow();
    expect(() => parseWorkerEnv({ ...base, SCRAPING_INDEED_MAX_ITEMS: "0" })).toThrow();
    expect(() => parseWorkerEnv({ ...base, SCRAPING_INDEED_MAX_ITEMS: "101" })).toThrow();
  });
});

describe("DeepSeek configuration", () => {
  it("defaults the model to deepseek-flash", () => {
    const env = parseApiEnv({ ...required });
    expect(env.DEEPSEEK_MODEL).toBe("deepseek-flash");
  });

  it("reads a custom DeepSeek model", () => {
    const env = parseApiEnv({ ...required, DEEPSEEK_MODEL: "deepseek-v4-pro" });
    expect(env.DEEPSEEK_MODEL).toBe("deepseek-v4-pro");
  });

  it("requires a non-empty DeepSeek API key", () => {
    const withoutKey: NodeJS.ProcessEnv = { ...required };
    delete withoutKey.DEEPSEEK_API_KEY;
    expect(() => parseApiEnv(withoutKey)).toThrow();
    expect(() => parseApiEnv({ ...required, DEEPSEEK_API_KEY: "" })).toThrow();
  });
});
