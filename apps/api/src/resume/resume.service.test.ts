import { describe, expect, it, vi } from "vitest";

import { ResumeService, type ResumeAiModel } from "./resume.service.js";
import { structuredResumeSchema, type StructuredResume } from "./structured-resume.js";

const createdAt = new Date("2026-07-24T10:00:00.000Z");
const structuredAt = new Date("2026-07-24T11:00:00.000Z");
const expiresAt = new Date("2026-07-25T10:00:00.000Z");

const sourceResumeRow = {
  id: "resume-1",
  fileType: "PDF",
  originalFileName: "cv.pdf",
  fileSize: 42,
  contentHash: "hash",
  extractedText: "Marie Martin\nDeveloppeuse Python\nDjango\nINGETIS",
  structuredFacts: null,
  structuredWarnings: [],
  structuredConfidence: null,
  structuredAt: null,
  expiresAt,
  createdAt,
  updatedAt: createdAt,
};

const structuredResume = {
  facts: {
    identity: { fullName: "Marie Martin", title: "Developpeuse Python" },
    education: [{ school: "INGETIS" }],
    experiences: [],
    projects: [],
    skills: [
      { name: "Python", category: "programming_language" },
      { name: "Django", category: "framework" },
    ],
    languages: [],
    certifications: [],
    links: [],
  },
  warnings: ["Adresse e-mail absente du CV."],
  confidence: 84,
} satisfies StructuredResume;

const createPrisma = () => ({
  candidateProfile: {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  sourceResume: {
    delete: vi.fn().mockResolvedValue(sourceResumeRow),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn().mockResolvedValue(sourceResumeRow),
    findUnique: vi.fn().mockResolvedValue(sourceResumeRow),
    update: vi.fn().mockResolvedValue({
      ...sourceResumeRow,
      structuredFacts: structuredResume.facts,
      structuredWarnings: structuredResume.warnings,
      structuredConfidence: structuredResume.confidence,
      structuredAt,
      updatedAt: structuredAt,
    }),
    findMany: vi.fn(),
    upsert: vi.fn().mockResolvedValue(sourceResumeRow),
  },
});

type SourceResumeUpsertArgs = {
  where: { contentHash: string };
  update: { expiresAt: Date };
  create: {
    fileType: "TXT";
    originalFileName: string;
    fileSize: number;
    contentHash: string;
    extractedText: string;
    expiresAt: Date;
  };
};

describe("ResumeService.structure", () => {
  it("stores validated facts extracted from the source resume text", async () => {
    const prisma = createPrisma();
    const generateStructured = vi
      .fn<ResumeAiModel["generateStructured"]>()
      .mockResolvedValue(structuredResume);
    const model: ResumeAiModel = { generateStructured };
    const service = new ResumeService(prisma as never, model, () => structuredAt, 24);

    const result = await service.structure("resume-1");

    const request = generateStructured.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    if (request === undefined) {
      throw new Error("generateStructured was not called.");
    }
    expect(request.schema).toBe(structuredResumeSchema);
    expect(request.temperature).toBe(0);
    expect(request.prompt).toContain(sourceResumeRow.extractedText);
    expect(request.system).toContain("N'invente");
    expect(prisma.sourceResume.update).toHaveBeenCalledWith({
      where: { id: "resume-1" },
      data: {
        structuredFacts: structuredResume.facts,
        structuredWarnings: structuredResume.warnings,
        structuredConfidence: structuredResume.confidence,
        structuredAt,
      },
    });
    expect(result?.structured).toEqual({
      facts: structuredResume.facts,
      warnings: structuredResume.warnings,
      confidence: structuredResume.confidence,
      structuredAt,
    });
  });

  it("returns null without calling the model when the source resume does not exist", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue(null);
    const generateStructured = vi.fn<ResumeAiModel["generateStructured"]>();
    const model: ResumeAiModel = { generateStructured };
    const service = new ResumeService(prisma as never, model, () => structuredAt, 24);

    await expect(service.structure("missing")).resolves.toBeNull();

    expect(generateStructured).not.toHaveBeenCalled();
    expect(prisma.sourceResume.update).not.toHaveBeenCalled();
  });

  it("fails explicitly when local AI is disabled", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never, null, () => structuredAt, 24);

    await expect(service.structure("resume-1")).rejects.toMatchObject({ name: "AiDisabledError" });
    expect(prisma.sourceResume.update).not.toHaveBeenCalled();
  });
});

describe("ResumeService retention", () => {
  it("stores an expiration date when a source resume is imported", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never, null, () => createdAt, 24);

    await service.ingest(Buffer.from("Marie Martin"), "TXT", "cv.txt");

    const args = prisma.sourceResume.upsert.mock.calls[0]?.[0] as
      SourceResumeUpsertArgs | undefined;
    expect(args).toBeDefined();
    if (args === undefined) {
      throw new Error("sourceResume.upsert was not called.");
    }
    expect(args.where.contentHash).toHaveLength(64);
    expect(args.update).toEqual({ expiresAt });
    expect(args.create).toEqual({
      fileType: "TXT",
      originalFileName: "cv.txt",
      fileSize: 12,
      contentHash: args.where.contentHash,
      extractedText: "Marie Martin",
      expiresAt,
    });
  });

  it("purges expired source resumes before listing active ones", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findMany.mockResolvedValue([sourceResumeRow]);
    const service = new ResumeService(prisma as never, null, () => structuredAt, 24);

    await expect(service.list()).resolves.toHaveLength(1);

    expect(prisma.sourceResume.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: structuredAt } },
    });
    expect(prisma.sourceResume.findMany).toHaveBeenCalledWith({
      where: { expiresAt: { gt: structuredAt } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("does not expose an expired source resume by id", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue(null);
    const service = new ResumeService(prisma as never, null, () => structuredAt, 24);

    await expect(service.get("resume-1")).resolves.toBeNull();

    expect(prisma.sourceResume.findFirst).toHaveBeenCalledWith({
      where: { id: "resume-1", expiresAt: { gt: structuredAt } },
    });
  });
});

describe("ResumeService.remove", () => {
  it("deletes an active source resume and clears profile references", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never, null, () => structuredAt, 24);

    await expect(service.remove("resume-1")).resolves.toBe(true);

    expect(prisma.candidateProfile.updateMany).toHaveBeenCalledWith({
      where: { activeResumeId: "resume-1" },
      data: { activeResumeId: null },
    });
    expect(prisma.sourceResume.delete).toHaveBeenCalledWith({ where: { id: "resume-1" } });
  });

  it("returns false when the source resume is missing or expired", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue(null);
    const service = new ResumeService(prisma as never, null, () => structuredAt, 24);

    await expect(service.remove("missing")).resolves.toBe(false);

    expect(prisma.candidateProfile.updateMany).not.toHaveBeenCalled();
    expect(prisma.sourceResume.delete).not.toHaveBeenCalled();
  });
});
