import { describe, expect, it, vi } from "vitest";

import { JOB_BOARD_EXCERPT_CHARS, excerptOf } from "./job-origin.js";
import { JobsService } from "./jobs.service.js";

const now = new Date("2026-10-06T10:00:00.000Z");

const longDescription = "Nous recherchons un développeur. ".repeat(40).trim();

const jobRow = (over: Record<string, unknown> = {}) => ({
  slug: "stage-developpeur-full-stack-paris-75",
  isDemo: false,
  title: "Stage développeur full-stack",
  roleCategory: "FULLSTACK",
  company: { name: "Galadrim", logoUrl: null, website: null, careerUrl: null },
  skills: [],
  sources: [
    {
      name: "welcome-to-the-jungle",
      url: "https://www.welcometothejungle.com/fr/companies/galadrim/jobs/stage",
      priority: 40,
      checkedAt: now,
    },
  ],
  city: "PARIS",
  departmentCode: "75",
  postalCode: "75002",
  contractType: "INTERNSHIP",
  workMode: "ONSITE",
  publishedAt: new Date("2026-10-05T11:45:49.654Z"),
  expiresAt: new Date("2026-10-12T11:45:49.654Z"),
  dataQualityScore: 70,
  description: longDescription,
  responsibilities: ["Développer des interfaces."],
  requirements: ["TypeScript."],
  benefits: ["Tickets restaurant."],
  salaryMin: null,
  salaryMax: null,
  salaryPeriod: null,
  salaryText: null,
  studyLevel: null,
  startDate: null,
  duration: null,
  canonicalUrl: "https://www.welcometothejungle.com/fr/companies/galadrim/jobs/stage",
  applyUrl: null,
  ...over,
});

const createPrisma = (
  row: unknown,
  jobBoards: { name: string }[] = [{ name: "welcome-to-the-jungle" }],
) => ({
  connector: { findMany: vi.fn().mockResolvedValue(jobBoards) },
  job: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(row),
    groupBy: vi.fn().mockResolvedValue([]),
  },
});

describe("JobsService.findBySlug", () => {
  it("ne livre qu'un extrait d'une offre de job board", async () => {
    const service = new JobsService(createPrisma(jobRow()) as never);

    const job = await service.findBySlug("stage-developpeur-full-stack-paris-75", "LAST_72H", now);

    expect(job?.origin).toBe("JOB_BOARD");
    expect(job?.descriptionTruncated).toBe(true);
    expect(job?.description).toBe(excerptOf(longDescription));
    expect(job?.description.length).toBeLessThanOrEqual(JOB_BOARD_EXCERPT_CHARS + 3);
    // Les listes dérivées de la description tierce ne sortent pas non plus.
    expect(job?.responsibilities).toEqual([]);
    expect(job?.requirements).toEqual([]);
    expect(job?.benefits).toEqual([]);
    // Le lien vers l'origine reste, c'est lui qui remplace le texte coupé.
    expect(job?.canonicalSource?.url).toBe(
      "https://www.welcometothejungle.com/fr/companies/galadrim/jobs/stage",
    );
  });

  it("laisse une offre officielle entière", async () => {
    const row = jobRow({
      sources: [
        {
          name: "greenhouse",
          url: "https://boards.greenhouse.io/acme/jobs/1",
          priority: 100,
          checkedAt: now,
        },
      ],
    });
    const service = new JobsService(createPrisma(row) as never);

    const job = await service.findBySlug("stage-developpeur-full-stack-paris-75", "LAST_72H", now);

    expect(job?.origin).toBe("OFFICIAL");
    expect(job?.descriptionTruncated).toBe(false);
    expect(job?.description).toBe(longDescription);
    expect(job?.requirements).toEqual(["TypeScript."]);
  });

  it("ne dépouille pas une offre dont la source est inconnue du registre", async () => {
    const service = new JobsService(createPrisma(jobRow(), []) as never);

    const job = await service.findBySlug("stage-developpeur-full-stack-paris-75", "LAST_72H", now);

    expect(job?.origin).toBe("OFFICIAL");
    expect(job?.description).toBe(longDescription);
  });

  it("rend null quand l'offre n'est pas dans la fenêtre publique", async () => {
    const service = new JobsService(createPrisma(null) as never);

    expect(await service.findBySlug("inconnue", "LAST_72H", now)).toBeNull();
  });
});

describe("JobsService.list", () => {
  it("signale l'origine de chaque offre de la liste", async () => {
    const row = jobRow({
      sources: [
        {
          name: "welcome-to-the-jungle",
          url: "https://www.welcometothejungle.com/fr/companies/galadrim/jobs/stage",
          priority: 40,
        },
      ],
    });
    const prisma = createPrisma(null);
    prisma.job.count.mockResolvedValue(1);
    prisma.job.findMany.mockResolvedValue([row]);
    const service = new JobsService(prisma as never);

    const list = await service.list(
      {
        freshness: "LAST_72H",
        sort: "DATE",
        page: 1,
        pageSize: 20,
      },
      now,
    );

    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.origin).toBe("JOB_BOARD");
    expect(list.items[0]?.canonicalSource?.name).toBe("welcome-to-the-jungle");
  });
});

describe("JobsService.stats", () => {
  it("compte les publications récentes et rend la dernière date", async () => {
    const prisma = createPrisma(null);
    prisma.job.count.mockResolvedValueOnce(3).mockResolvedValueOnce(9);
    const lastPublishedAt = new Date("2026-10-06T09:00:00.000Z");
    prisma.job.findFirst.mockResolvedValue({ publishedAt: lastPublishedAt });
    const service = new JobsService(prisma as never);

    const stats = await service.stats(now);

    expect(stats).toEqual({ publishedLast24h: 3, publishedLast72h: 9, lastPublishedAt });

    // Les deux comptes portent la même fenêtre publique, à l'ancienneté près.
    const first = prisma.job.count.mock.calls[0]?.[0] as {
      where: { status: string; expiresAt: { gt: Date }; publishedAt: { gte: Date } };
    };
    const second = prisma.job.count.mock.calls[1]?.[0] as {
      where: { publishedAt: { gte: Date } };
    };
    expect(first.where.status).toBe("PUBLISHED");
    expect(first.where.expiresAt.gt).toEqual(now);
    const firstWindowHours = (now.getTime() - first.where.publishedAt.gte.getTime()) / 3_600_000;
    const secondWindowHours = (now.getTime() - second.where.publishedAt.gte.getTime()) / 3_600_000;
    expect(firstWindowHours).toBe(24);
    expect(secondWindowHours).toBe(72);
  });

  it("rend null quand aucune offre n'est publiée dans la fenêtre", async () => {
    const prisma = createPrisma(null);
    prisma.job.findFirst.mockResolvedValue(null);
    const service = new JobsService(prisma as never);

    await expect(service.stats(now)).resolves.toEqual({
      publishedLast24h: 0,
      publishedLast72h: 0,
      lastPublishedAt: null,
    });
  });
});

describe("JobsService.filters", () => {
  it("range les valeurs par facette et trie les départements", async () => {
    const prisma = createPrisma(null);
    prisma.job.groupBy = vi
      .fn()
      .mockResolvedValueOnce([{ roleCategory: "FULLSTACK", _count: { _all: 4 } }])
      .mockResolvedValueOnce([{ contractType: "ALTERNANCE", _count: { _all: 2 } }])
      .mockResolvedValueOnce([
        { departmentCode: "92", _count: { _all: 1 } },
        { departmentCode: "75", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([{ workMode: "REMOTE", _count: { _all: 1 } }]);
    const service = new JobsService(prisma as never);

    const filters = await service.filters("LAST_72H", now);

    expect(filters.roles).toEqual([{ value: "FULLSTACK", count: 4 }]);
    expect(filters.contracts).toEqual([{ value: "ALTERNANCE", count: 2 }]);
    // Les départements sont triés par code, pas par volume.
    expect(filters.departments).toEqual([
      { value: "75", count: 3 },
      { value: "92", count: 1 },
    ]);
    expect(filters.workModes).toEqual([{ value: "REMOTE", count: 1 }]);
  });
});
