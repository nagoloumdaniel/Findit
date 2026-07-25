import { describe, expect, it, vi } from "vitest";

import { MatchingService, ResumeNotStructuredError } from "./matching.service.js";

const now = new Date("2026-07-25T10:00:00.000Z");
const computedAt = new Date("2026-07-25T10:00:01.000Z");

const structuredFacts = {
  identity: { title: "Développeur web junior" },
  education: [],
  experiences: [
    {
      title: "Développeur front-end",
      achievements: [],
      skills: ["Git"],
    },
  ],
  projects: [],
  skills: [{ name: "TypeScript" }, { name: "React" }, { name: "Node.js" }, { name: "PostgreSQL" }],
  languages: [{ name: "Français" }, { name: "Anglais" }],
  certifications: [],
  links: [],
};

const resumeRow = {
  id: "3f1d3f44-0000-7000-8000-000000000001",
  structuredFacts,
  expiresAt: new Date("2026-07-26T10:00:00.000Z"),
};

const jobRow = {
  id: "job-1",
  slug: "alternance-developpeur-front-end-paris-75",
  title: "Alternance Développeur Front-End H/F",
  normalizedTitle: "developpeur front end",
  roleCategory: "FRONTEND",
  requirements: ["Maîtrise de TypeScript et React.", "Anglais professionnel."],
  responsibilities: ["Développer des interfaces web."],
  description: "Stack : React, Node.js, PostgreSQL, Docker.",
  company: { name: "Acme" },
};

const storedRow = (over: Record<string, unknown> = {}) => ({
  id: "match-1",
  sourceResumeId: resumeRow.id,
  jobId: jobRow.id,
  score: 80,
  scoreBreakdown: [],
  matchedSkills: ["TypeScript"],
  missingSkills: [],
  missingKeywords: [],
  strengths: [],
  weaknesses: [],
  recommendations: [],
  confidence: 70,
  insufficientDataWarning: null,
  computedBy: "RULE",
  createdAt: computedAt,
  updatedAt: computedAt,
  ...over,
});

const createPrisma = () => ({
  sourceResume: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn().mockResolvedValue(resumeRow),
  },
  job: {
    findFirst: vi.fn().mockResolvedValue(jobRow),
  },
  sourceResumeMatch: {
    upsert: vi.fn().mockResolvedValue(storedRow()),
    findMany: vi.fn().mockResolvedValue([]),
  },
});

describe("MatchingService.compute", () => {
  it("computes a rule-based score and stores one row per resume/job pair", async () => {
    const prisma = createPrisma();
    const service = new MatchingService(prisma as never, () => now);

    const view = await service.compute(resumeRow.id, jobRow.slug);

    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: { slug: jobRow.slug, status: "PUBLISHED" },
      include: { company: { select: { name: true } } },
    });

    const args = prisma.sourceResumeMatch.upsert.mock.calls[0]?.[0] as
      | {
          where: { sourceResumeId_jobId: { sourceResumeId: string; jobId: string } };
          create: Record<string, unknown>;
        }
      | undefined;
    expect(args).toBeDefined();
    if (args === undefined) {
      throw new Error("sourceResumeMatch.upsert was not called.");
    }
    expect(args.where.sourceResumeId_jobId).toEqual({
      sourceResumeId: resumeRow.id,
      jobId: jobRow.id,
    });
    // Le moteur est déterministe : les compétences exigées lisibles dans
    // l'offre et présentes dans le CV doivent ressortir telles quelles.
    expect(args.create["computedBy"]).toBe("RULE");
    expect(args.create["matchedSkills"]).toContain("TypeScript");
    expect(args.create["matchedSkills"]).toContain("React");
    expect(typeof args.create["score"]).toBe("number");

    expect(view).toMatchObject({
      job: { slug: jobRow.slug, title: jobRow.title, companyName: "Acme" },
      computedAt,
    });
  });

  it("returns resume_not_found for a missing or expired resume", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue(null);
    const service = new MatchingService(prisma as never, () => now);

    await expect(service.compute(resumeRow.id, jobRow.slug)).resolves.toBe("resume_not_found");
    expect(prisma.sourceResumeMatch.upsert).not.toHaveBeenCalled();
  });

  it("refuses to score an unstructured resume instead of guessing", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue({ ...resumeRow, structuredFacts: null });
    const service = new MatchingService(prisma as never, () => now);

    await expect(service.compute(resumeRow.id, jobRow.slug)).rejects.toBeInstanceOf(
      ResumeNotStructuredError,
    );
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });

  it("returns job_not_found when the job is absent or not published", async () => {
    const prisma = createPrisma();
    prisma.job.findFirst.mockResolvedValue(null);
    const service = new MatchingService(prisma as never, () => now);

    await expect(service.compute(resumeRow.id, "offre-disparue")).resolves.toBe("job_not_found");
    expect(prisma.sourceResumeMatch.upsert).not.toHaveBeenCalled();
  });

  it("purges expired resumes before computing, like the resume routes do", async () => {
    const prisma = createPrisma();
    const service = new MatchingService(prisma as never, () => now);

    await service.compute(resumeRow.id, jobRow.slug);

    expect(prisma.sourceResume.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    });
  });
});

describe("MatchingService.list", () => {
  it("returns stored matches best-first with an identifiable job", async () => {
    const prisma = createPrisma();
    prisma.sourceResumeMatch.findMany.mockResolvedValue([
      storedRow({ job: { slug: jobRow.slug, title: jobRow.title, company: { name: "Acme" } } }),
    ]);
    const service = new MatchingService(prisma as never, () => now);

    const result = await service.list(resumeRow.id);

    expect(prisma.sourceResumeMatch.findMany).toHaveBeenCalledWith({
      where: { sourceResumeId: resumeRow.id },
      orderBy: { score: "desc" },
      include: {
        job: { select: { slug: true, title: true, company: { select: { name: true } } } },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      job: { slug: jobRow.slug, companyName: "Acme" },
      score: 80,
    });
  });

  it("returns resume_not_found instead of listing for a dead resume", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue(null);
    const service = new MatchingService(prisma as never, () => now);

    await expect(service.list(resumeRow.id)).resolves.toBe("resume_not_found");
    expect(prisma.sourceResumeMatch.findMany).not.toHaveBeenCalled();
  });
});
