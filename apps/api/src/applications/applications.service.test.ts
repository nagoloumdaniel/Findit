import { describe, expect, it, vi } from "vitest";

import { ApplicationsService } from "./applications.service.js";

const now = new Date("2026-07-26T10:00:00.000Z");

const jobRow = {
  id: "job-1",
  slug: "demo-alternance-developpeur-front-end-react-paris",
  title: "Alternance - Développeur Front-end React H/F",
  companyId: "company-1",
};

const storedRow = (over: Record<string, unknown> = {}) => ({
  id: "app-1",
  jobId: jobRow.id,
  jobSlug: jobRow.slug,
  jobTitle: jobRow.title,
  companyName: "Orbit Studio",
  resumeFileName: "mon-cv.pdf",
  matchScore: 93,
  letterSubject: "Candidature",
  letterParagraphs: ["Premier paragraphe."],
  status: "TO_APPLY",
  notes: null,
  appliedAt: null,
  createdAt: now,
  updatedAt: now,
  events: [{ status: "TO_APPLY", note: null, occurredAt: now }],
  ...over,
});

const createPrisma = () => ({
  job: { findFirst: vi.fn().mockResolvedValue(jobRow) },
  company: { findUnique: vi.fn().mockResolvedValue({ name: "Orbit Studio" }) },
  sourceResume: {
    findUnique: vi.fn().mockResolvedValue({ originalFileName: "mon-cv.pdf" }),
  },
  sourceResumeMatch: { findFirst: vi.fn().mockResolvedValue({ score: 93 }) },
  sourceCoverLetter: {
    findFirst: vi
      .fn()
      .mockResolvedValue({ subject: "Candidature", paragraphs: ["Premier paragraphe."] }),
  },
  application: {
    create: vi.fn().mockResolvedValue(storedRow()),
    findMany: vi.fn().mockResolvedValue([storedRow()]),
    findUnique: vi.fn().mockResolvedValue(storedRow()),
    update: vi.fn().mockResolvedValue(storedRow({ status: "APPLIED", appliedAt: now })),
    delete: vi.fn().mockResolvedValue(storedRow()),
  },
});

describe("ApplicationsService.create", () => {
  it("snapshots the job, resume name, score and letter into the folder", async () => {
    const prisma = createPrisma();
    const service = new ApplicationsService(prisma as never, () => now);

    const view = await service.create({
      jobSlug: jobRow.slug,
      resumeId: "3f1d3f44-0000-7000-8000-000000000001",
    });

    const args = prisma.application.create.mock.calls[0]?.[0] as
      { data: Record<string, unknown> } | undefined;
    expect(args).toBeDefined();
    if (args === undefined) {
      throw new Error("application.create was not called.");
    }
    // L'instantané rend le dossier indépendant de la vie de l'offre et du CV.
    expect(args.data["jobTitle"]).toBe(jobRow.title);
    expect(args.data["companyName"]).toBe("Orbit Studio");
    expect(args.data["resumeFileName"]).toBe("mon-cv.pdf");
    expect(args.data["matchScore"]).toBe(93);
    expect(args.data["letterSubject"]).toBe("Candidature");
    expect(view).toMatchObject({ jobSlug: jobRow.slug, status: "TO_APPLY", jobStillExists: true });
  });

  it("returns job_not_found for an unknown offer", async () => {
    const prisma = createPrisma();
    prisma.job.findFirst.mockResolvedValue(null);
    const service = new ApplicationsService(prisma as never, () => now);

    await expect(service.create({ jobSlug: "offre-disparue" })).resolves.toBe("job_not_found");
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it("creates a folder without resume snapshots when no resume is given", async () => {
    const prisma = createPrisma();
    const service = new ApplicationsService(prisma as never, () => now);

    await service.create({ jobSlug: jobRow.slug });

    const args = prisma.application.create.mock.calls[0]?.[0] as
      { data: Record<string, unknown> } | undefined;
    expect(args?.data["resumeFileName"]).toBeNull();
    expect(args?.data["matchScore"]).toBeNull();
    expect(prisma.sourceResume.findUnique).not.toHaveBeenCalled();
  });
});

describe("ApplicationsService.update", () => {
  it("historizes a status change and stamps appliedAt once on APPLIED", async () => {
    const prisma = createPrisma();
    const service = new ApplicationsService(prisma as never, () => now);

    await service.update("app-1", { status: "APPLIED", note: "Envoyée via le site." });

    const args = prisma.application.update.mock.calls[0]?.[0] as
      { data: Record<string, unknown> } | undefined;
    expect(args?.data["status"]).toBe("APPLIED");
    expect(args?.data["appliedAt"]).toEqual(now);
    expect(args?.data["events"]).toEqual({
      create: { status: "APPLIED", note: "Envoyée via le site." },
    });
  });

  it("does not write an event when only notes change", async () => {
    const prisma = createPrisma();
    const service = new ApplicationsService(prisma as never, () => now);

    await service.update("app-1", { notes: "Relancer la semaine prochaine." });

    const args = prisma.application.update.mock.calls[0]?.[0] as
      { data: Record<string, unknown> } | undefined;
    expect(args?.data["events"]).toBeUndefined();
    expect(args?.data["notes"]).toBe("Relancer la semaine prochaine.");
  });

  it("returns null for a missing folder", async () => {
    const prisma = createPrisma();
    prisma.application.findUnique.mockResolvedValue(null);
    const service = new ApplicationsService(prisma as never, () => now);

    await expect(service.update("missing", { status: "APPLIED" })).resolves.toBeNull();
    expect(prisma.application.update).not.toHaveBeenCalled();
  });
});

describe("ApplicationsService.remove", () => {
  it("deletes an existing folder, refuses a missing one", async () => {
    const prisma = createPrisma();
    const service = new ApplicationsService(prisma as never, () => now);
    await expect(service.remove("app-1")).resolves.toBe(true);

    prisma.application.findUnique.mockResolvedValue(null);
    await expect(service.remove("missing")).resolves.toBe(false);
  });
});
