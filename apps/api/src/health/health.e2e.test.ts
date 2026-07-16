import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../app.module.js";
import { createFastifyAdapter } from "../fastify-adapter.js";

describe("GET /health", () => {
  const corsOrigin = "http://localhost:3000";
  let app: NestFastifyApplication | undefined;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    app.enableCors({ origin: corsOrigin });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns the real API process health", async () => {
    const response = await app!.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", service: "api" });
  });

  it("returns the configured CORS origin unchanged", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/health",
      headers: { origin: corsOrigin },
    });

    expect(response.headers["access-control-allow-origin"]).toBe(corsOrigin);
  });

  it("does not expose an implicit HEAD route", async () => {
    const response = await app!.inject({ method: "HEAD", url: "/health" });

    expect(response.statusCode).toBe(404);
  });
});
