import { describe, expect, it, vi } from "vitest";

import { AgentService } from "./agent.service.js";

const now = new Date("2026-10-06T10:00:00.000Z");

type AnalyticsDouble = {
  publishedRows?: { publishedAt: Date }[];
  crawlJobs?: { source: { name: string }; _count: { pages: number } }[];
  companies?: { name: string; _count: { jobs: number } }[];
  statusRows?: { status: string; _count: { _all: number } }[];
};

/*
 * Double de Prisma limité aux quatre lectures de `analytics`. Chaque appel est
 * un mock qui renvoie ce que le test veut observer, sans base réelle : le
 * service ne doit dépendre d'aucune requête SQL.
 */
const createPrisma = (over: AnalyticsDouble = {}) => ({
  job: { findMany: vi.fn().mockResolvedValue(over.publishedRows ?? []) },
  crawlJob: { findMany: vi.fn().mockResolvedValue(over.crawlJobs ?? []) },
  company: { findMany: vi.fn().mockResolvedValue(over.companies ?? []) },
  agentRun: { groupBy: vi.fn().mockResolvedValue(over.statusRows ?? []) },
});

describe("AgentService.analytics", () => {
  it("série les 14 derniers jours, un jour sans offre restant à zéro", async () => {
    const prisma = createPrisma({
      publishedRows: [
        { publishedAt: new Date("2026-10-06T08:00:00.000Z") },
        { publishedAt: new Date("2026-10-06T09:30:00.000Z") },
        { publishedAt: new Date("2026-10-04T12:00:00.000Z") },
      ],
    });
    const service = new AgentService(prisma as never);

    const analytics = await service.analytics(now);

    expect(analytics.publishedPerDay).toHaveLength(14);
    // Dernier jour de la série : les deux offres du 6 octobre.
    expect(analytics.publishedPerDay[13]).toEqual({ date: "2026-10-06", count: 2 });
    expect(analytics.publishedPerDay[11]).toEqual({ date: "2026-10-04", count: 1 });
    // Le 5 octobre n'a rien publié : le jour reste présent, à zéro.
    expect(analytics.publishedPerDay[12]).toEqual({ date: "2026-10-05", count: 0 });
  });

  it("borne la fenêtre à minuit UTC du premier jour couvert", async () => {
    const prisma = createPrisma();
    const service = new AgentService(prisma as never);

    await service.analytics(now);

    const args = prisma.job.findMany.mock.calls[0]?.[0] as
      { where: { status: string; publishedAt: { gte: Date } } } | undefined;
    expect(args?.where.publishedAt.gte).toEqual(new Date("2026-09-23T00:00:00.000Z"));
  });

  it("additionne les pages d'une même source et garde le top 5", async () => {
    const prisma = createPrisma({
      crawlJobs: [
        { source: { name: "acme" }, _count: { pages: 10 } },
        { source: { name: "acme" }, _count: { pages: 5 } },
        { source: { name: "beta" }, _count: { pages: 3 } },
        { source: { name: "gamma" }, _count: { pages: 20 } },
        { source: { name: "delta" }, _count: { pages: 7 } },
        { source: { name: "epsilon" }, _count: { pages: 6 } },
        { source: { name: "zeta" }, _count: { pages: 1 } },
      ],
    });
    const service = new AgentService(prisma as never);

    const analytics = await service.analytics(now);

    expect(analytics.topSources).toEqual([
      { name: "gamma", pageCount: 20 },
      { name: "acme", pageCount: 15 },
      { name: "delta", pageCount: 7 },
      { name: "epsilon", pageCount: 6 },
      { name: "beta", pageCount: 3 },
    ]);
  });

  it("restitue les entreprises telles qu'ordonnées par la base", async () => {
    const prisma = createPrisma({
      companies: [
        { name: "Acme", _count: { jobs: 12 } },
        { name: "Beta", _count: { jobs: 8 } },
      ],
    });
    const service = new AgentService(prisma as never);

    const analytics = await service.analytics(now);

    expect(analytics.topCompanies).toEqual([
      { name: "Acme", jobCount: 12 },
      { name: "Beta", jobCount: 8 },
    ]);
  });

  it("dénombre les issues de run sans compter les runs en cours", async () => {
    const prisma = createPrisma({
      statusRows: [
        { status: "SUCCEEDED", _count: { _all: 4 } },
        { status: "FAILED", _count: { _all: 2 } },
        { status: "STOPPED", _count: { _all: 1 } },
        { status: "RUNNING", _count: { _all: 3 } },
      ],
    });
    const service = new AgentService(prisma as never);

    const analytics = await service.analytics(now);

    expect(analytics.runStatuses).toEqual({ succeeded: 4, failed: 2, stopped: 1 });
  });
});
