import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";
import type {
  AgentAnalytics,
  AgentRunDetail,
  AgentRunSummary,
  AgentStats,
  SourceItem,
} from "./agent.service.js";

/*
 * Le service est remplacé : ces tests portent sur le routage et sur la forme
 * rendue, pas sur les requêtes Prisma (couvertes par `agent.service.test.ts`).
 */
const run: AgentRunSummary = {
  id: "run-1",
  objective: "Trouver des offres",
  status: "SUCCEEDED",
  searches: 3,
  pages: 12,
  extracted: 8,
  validated: 6,
  duplicates: 1,
  inserted: 5,
  errors: 0,
  costMicroUsd: 4_200,
  startedAt: new Date("2026-10-07T08:00:00.000Z"),
  endedAt: new Date("2026-10-07T08:05:00.000Z"),
};

/// Les dates traversent la sérialisation JSON : le client reçoit des ISO 8601.
const serializedRun = {
  ...run,
  startedAt: "2026-10-07T08:00:00.000Z",
  endedAt: "2026-10-07T08:05:00.000Z",
};

const runDetail: AgentRunDetail = {
  ...run,
  actions: [
    {
      kind: "EXTRACT",
      detail: "1200+340 tok",
      costMicroUsd: 900,
      createdAt: new Date("2026-10-07T08:01:00.000Z"),
    },
  ],
  errorLogs: [],
};

const stats: AgentStats = {
  lastRun: run,
  sourceCount: 4,
  pageCount: 120,
  publishedJobCount: 33,
};

const analytics = {
  runStatuses: { succeeded: 7, failed: 1, stopped: 0 },
} as AgentAnalytics;

const sources: SourceItem[] = [
  {
    id: "src-1",
    name: "greenhouse",
    url: "https://boards.greenhouse.io/acme",
    type: "API",
    schedule: "0 */6 * * *",
    maxDepth: 2,
    maxPages: 50,
    priority: 100,
    enabled: true,
    lastCrawlAt: null,
  },
];

const service = {
  listRuns: vi.fn<AgentService["listRuns"]>(),
  stats: vi.fn<AgentService["stats"]>(),
  analytics: vi.fn<AgentService["analytics"]>(),
  listSources: vi.fn<AgentService["listSources"]>(),
  runDetail: vi.fn<AgentService["runDetail"]>(),
};

describe("AgentController", () => {
  let app: NestFastifyApplication | undefined;

  beforeEach(async () => {
    vi.resetAllMocks();
    service.listRuns.mockResolvedValue([run]);
    service.stats.mockResolvedValue(stats);
    service.analytics.mockResolvedValue(analytics);
    service.listSources.mockResolvedValue(sources);
    service.runDetail.mockResolvedValue(runDetail);

    const moduleRef = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [{ provide: AgentService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("rend la liste des runs", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/agent/runs" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([serializedRun]);
    expect(service.listRuns).toHaveBeenCalledOnce();
    // La route à paramètre ne doit pas capter la route fixe.
    expect(service.runDetail).not.toHaveBeenCalled();
  });

  it("rend les statistiques", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/agent/stats" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...stats,
      lastRun: serializedRun,
    });
    expect(service.stats).toHaveBeenCalledOnce();
  });

  it("rend les analytics sans les remodeler", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/agent/analytics" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(analytics);
    expect(service.analytics).toHaveBeenCalledOnce();
  });

  it("rend les sources suivies", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/agent/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(sources);
    expect(service.listSources).toHaveBeenCalledOnce();
  });

  it("passe l'identifiant du run au service", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/agent/runs/run-42" });

    expect(response.statusCode).toBe(200);
    expect(service.runDetail).toHaveBeenCalledWith("run-42");
    expect(response.json()).toMatchObject({ id: "run-1" });
  });

  it("rend 404 quand le run n'existe pas", async () => {
    service.runDetail.mockResolvedValue(null);

    const response = await app!.inject({ method: "GET", url: "/api/agent/runs/inconnu" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: "Ce run n'existe pas." });
    expect(service.runDetail).toHaveBeenCalledWith("inconnu");
  });
});
