import { describe, expect, it, vi } from "vitest";

import type { IngestionDecision, JobDraft } from "./ingest.js";
import { persistDecision } from "./persist.js";

const NOW = new Date("2026-07-26T12:00:00.000Z");

const draft = (over: Partial<JobDraft> = {}): JobDraft => ({
  title: "Alternance - Développeur Front-end React H/F",
  normalizedTitle: "developpeur front end react",
  roleCategory: "FRONTEND",
  contractType: "ALTERNANCE",
  workMode: "HYBRID",
  description: "Développer des interfaces React et TypeScript au sein de l'équipe produit.",
  responsibilities: [],
  requirements: [],
  benefits: [],
  city: "Paris",
  departmentCode: "75",
  publishedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 72 * 3600 * 1000),
  canonicalUrl: "https://example.invalid/offre",
  externalId: "ext-1",
  companyName: "Orbit Studio",
  sourceName: "greenhouse",
  confidenceScore: 90,
  dataQualityScore: 90,
  schoolRiskScore: 0,
  schoolRiskReasons: [],
  status: "PUBLISHED",
  ...over,
});

const decision = (jobDraft: JobDraft): IngestionDecision =>
  ({ outcome: "PUBLISHED", stage: "ingestion", reasons: [], draft: jobDraft }) as never;

const context = {
  sourceUrl: "https://example.invalid/offre",
  checkedAt: NOW,
  correlationId: "test",
  sourcePriority: 100,
};

/*
 * Ligne déjà en base, quasi identique à la candidate : même titre normalisé,
 * même entreprise, même département, deux heures d'écart.
 */
const existingRow = {
  id: "job-existing",
  city: "Paris",
  departmentCode: "75",
  publishedAt: new Date(NOW.getTime() - 2 * 3600 * 1000),
  description: "Développer des interfaces React et TypeScript au sein de l'équipe produit.",
  normalizedTitle: "developpeur front end react",
  duplicateGroupId: null,
  company: { normalizedName: "orbit studio" },
};

const createPrisma = (candidates: (typeof existingRow)[]) => ({
  company: { upsert: vi.fn().mockResolvedValue({ id: "company-1" }) },
  job: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: "job-new" }),
    findMany: vi.fn().mockResolvedValue(candidates),
    update: vi.fn().mockResolvedValue({}),
  },
  jobSource: { upsert: vi.fn().mockResolvedValue({}) },
  processingLog: { create: vi.fn().mockResolvedValue({}) },
  duplicateGroup: { create: vi.fn().mockResolvedValue({ id: "group-1" }) },
  duplicateDecision: { create: vi.fn().mockResolvedValue({}) },
});

describe("persistDecision - déduplication", () => {
  it("groups a created job with its near-identical twin and merges it", async () => {
    const prisma = createPrisma([existingRow]);

    const result = await persistDecision(prisma as never, decision(draft()), context);

    // Le groupe naît avec l'offre déjà en base pour canonique.
    expect(prisma.duplicateGroup.create).toHaveBeenCalledWith({
      data: { canonicalJobId: "job-existing" },
      select: { id: true },
    });
    // Les deux offres rejoignent le groupe ; la nouvelle est fusionnée.
    const updates = prisma.job.update.mock.calls.map((call) => call[0] as Record<string, unknown>);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({
      where: { id: "job-new" },
      data: { duplicateGroupId: "group-1", status: "DUPLICATE" },
    });
    const decisionArgs = prisma.duplicateDecision.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(decisionArgs.data["action"]).toBe("MERGED");
    expect(decisionArgs.data["decidedBy"]).toBe("RULE");
    expect(typeof decisionArgs.data["score"]).toBe("number");
    expect(result).toMatchObject({ kind: "created", status: "DUPLICATE" });
  });

  it("leaves a genuinely new job ungrouped", async () => {
    const distinct = {
      ...existingRow,
      company: { normalizedName: "autre entreprise" },
      description: "Poste totalement différent dans une autre équipe.",
    };
    const prisma = createPrisma([distinct]);

    const result = await persistDecision(prisma as never, decision(draft()), context);

    expect(prisma.duplicateGroup.create).not.toHaveBeenCalled();
    expect(prisma.duplicateDecision.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "created", status: "PUBLISHED" });
  });

  it("does not re-run deduplication on a recollected job", async () => {
    const prisma = createPrisma([existingRow]);
    prisma.job.findUnique.mockResolvedValue({ id: "job-new" });

    const result = await persistDecision(prisma as never, decision(draft()), context);

    expect(prisma.job.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "updated", status: "PUBLISHED" });
  });
});
