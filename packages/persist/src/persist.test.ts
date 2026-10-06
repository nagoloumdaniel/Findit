import type { PrismaClient } from "@findit/database";
import type { JobOffer } from "@findit/extract";
import { describe, expect, it, vi } from "vitest";

import { persistOffers } from "./persist.js";

const NOW = new Date("2026-10-06T08:00:00.000Z");
const PUBLISHED_AT = new Date("2026-10-06T06:00:00.000Z");
const EXPIRES_AT = new Date(PUBLISHED_AT.getTime() + 72 * 3600 * 1000);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Offre valide de référence, tous champs facultatifs remplis. */
const offer = (over: Partial<JobOffer> = {}): JobOffer => ({
  title: "Alternance - Développeur Front-end React H/F",
  company: "Orbit Studio",
  location: "Paris",
  contractType: "Alternance",
  description: "Développer des interfaces React et TypeScript.",
  technologies: ["React", "TypeScript"],
  salary: "selon profil",
  publishedAt: PUBLISHED_AT.toISOString(),
  applicationUrl: "https://jobs.orbit.test/offre",
  sourceUrl: "https://jobs.orbit.test/offre",
  sourceDomain: "jobs.orbit.test",
  ...over,
});

/** Faux Prisma nommé : chaque méthode est un espion, remplacé par test. */
const createPrisma = () => {
  const prisma = {
    company: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  prisma.company.findFirst.mockResolvedValue(null);
  prisma.company.create.mockResolvedValue({ id: "company-1" });
  prisma.job.findFirst.mockResolvedValue(null);
  prisma.job.create.mockResolvedValue({ id: "job-1" });

  return prisma;
};

type FakePrisma = ReturnType<typeof createPrisma>;

const depsFor = (prisma: FakePrisma) => ({
  prisma: prisma as unknown as PrismaClient,
  now: () => NOW,
});

/** Données du premier `job.create`, telles qu'écrites en base. */
const jobCreateData = (prisma: FakePrisma): Record<string, unknown> => {
  const args = prisma.job.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
  return args.data;
};

describe("persistOffers - insertion", () => {
  it("écrit une ligne Job publiée avec tous les champs calculés", async () => {
    const prisma = createPrisma();

    const result = await persistOffers([offer()], depsFor(prisma));

    expect(result).toEqual({ inserted: 1, duplicates: 0, rejected: [] });
    const data = jobCreateData(prisma);
    expect(data).toMatchObject({
      title: "Alternance - Développeur Front-end React H/F",
      roleCategory: "FRONTEND",
      contractType: "ALTERNANCE",
      workMode: "ONSITE",
      description: "Développer des interfaces React et TypeScript.",
      city: "Paris",
      departmentCode: "75",
      canonicalUrl: "https://jobs.orbit.test/offre",
      applyUrl: null,
      companyId: "company-1",
      schoolRiskScore: 0,
      fraudRiskScore: 0,
      dataQualityScore: 100,
      confidenceScore: 90,
      status: "PUBLISHED",
    });
    expect(data["normalizedTitle"]).toContain("developpeur");
    expect(data["slug"]).toMatch(SLUG_PATTERN);
    expect((data["firstSeenAt"] as Date).getTime()).toBe(NOW.getTime());
    expect((data["lastSeenAt"] as Date).getTime()).toBe(NOW.getTime());
    expect((data["publishedAt"] as Date).getTime()).toBe(PUBLISHED_AT.getTime());
    expect((data["expiresAt"] as Date).getTime()).toBe(EXPIRES_AT.getTime());
  });

  it("stocke le lien de candidature quand il diffère de la page source", async () => {
    const prisma = createPrisma();

    await persistOffers(
      [offer({ applicationUrl: "https://apply.orbit.test/42" })],
      depsFor(prisma),
    );

    expect(jobCreateData(prisma)["applyUrl"]).toBe("https://apply.orbit.test/42");
  });

  it("réutilise l'entreprise au même nom normalisé, sans la recréer", async () => {
    const prisma = createPrisma();

    await persistOffers(
      [
        offer({ title: "Développeur Front-end React" }),
        offer({ title: "Développeur Back-end Python" }),
      ],
      depsFor(prisma),
    );

    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.company.create).toHaveBeenCalledTimes(1);
    expect(prisma.job.create).toHaveBeenCalledTimes(2);
  });
});

describe("persistOffers - déduplication", () => {
  it("écarte un doublon déjà présent en base, sans le réécrire", async () => {
    const prisma = createPrisma();
    prisma.job.findFirst.mockResolvedValue({ id: "job-existing" });

    const result = await persistOffers([offer()], depsFor(prisma));

    expect(result).toEqual({ inserted: 0, duplicates: 1, rejected: [] });
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("écarte un doublon dans le même lot", async () => {
    const prisma = createPrisma();

    const result = await persistOffers([offer(), offer()], depsFor(prisma));

    expect(result).toEqual({ inserted: 1, duplicates: 1, rejected: [] });
    expect(prisma.job.create).toHaveBeenCalledTimes(1);
  });
});

describe("persistOffers - rejets", () => {
  it("rejette une offre d'école ou d'organisme de formation", async () => {
    const prisma = createPrisma();

    const result = await persistOffers(
      [offer({ company: "École Supérieure de Code" })],
      depsFor(prisma),
    );

    expect(result.inserted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("cole");
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("rejette une offre hors Île-de-France", async () => {
    const prisma = createPrisma();

    const result = await persistOffers([offer({ location: "Lyon" })], depsFor(prisma));

    expect(result.inserted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("Île-de-France");
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("rejette une offre sans date de publication lisible", async () => {
    const prisma = createPrisma();

    const result = await persistOffers([offer({ publishedAt: "" })], depsFor(prisma));

    expect(result.inserted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("refuse une date non ISO au lieu de l'interpréter à l'américaine", async () => {
    const prisma = createPrisma();

    // « 06/10/2026 » veut dire le 6 octobre en France, mais `new Date` en fait
    // le 10 juin : une date plausible, donc invérifiable. On refuse.
    const result = await persistOffers([offer({ publishedAt: "06/10/2026" })], depsFor(prisma));

    expect(result.inserted).toBe(0);
    expect(result.rejected[0]?.reason).toContain("illisible");
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("rejette une offre dont le contrat est hors périmètre", async () => {
    const prisma = createPrisma();

    const result = await persistOffers(
      [offer({ title: "Développeur Back-end", contractType: "CDI" })],
      depsFor(prisma),
    );

    expect(result.inserted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("rejette une offre à l'URL de candidature invalide", async () => {
    const prisma = createPrisma();

    const result = await persistOffers([offer({ applicationUrl: "pas-une-url" })], depsFor(prisma));

    expect(result.inserted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(prisma.job.create).not.toHaveBeenCalled();
  });
});
