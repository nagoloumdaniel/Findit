import { describe, expect, it, vi } from "vitest";

import { DocumentsService, ResumeNotStructuredForDocumentError } from "./documents.service.js";

const now = new Date("2026-07-26T10:00:00.000Z");

const structuredFacts = {
  identity: { fullName: "Marie Martin", title: "Développeuse Python" },
  education: [],
  experiences: [],
  projects: [],
  skills: [{ name: "Python" }, { name: "Django" }],
  languages: [],
  certifications: [],
  links: [],
};

const resumeRow = {
  id: "3f1d3f44-0000-7000-8000-000000000001",
  structuredFacts,
  expiresAt: new Date("2026-07-27T10:00:00.000Z"),
};

const createPrisma = () => ({
  sourceResume: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn().mockResolvedValue(resumeRow),
  },
});

describe("DocumentsService.renderCv", () => {
  it("renders a real PDF from the structured facts, with a name-derived filename", async () => {
    const prisma = createPrisma();
    const service = new DocumentsService(prisma as never, () => now);

    const result = await service.renderCv(resumeRow.id);

    expect(result).not.toBeNull();
    if (result === null) {
      throw new Error("renderCv returned null.");
    }
    // Le service rend un vrai PDF, pas une doublure : l'en-tête du format fait foi.
    expect(result.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.fileName).toBe("cv-marie-martin.pdf");
  });

  it("returns null for a missing or expired resume, honoring retention", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue(null);
    const service = new DocumentsService(prisma as never, () => now);

    await expect(service.renderCv(resumeRow.id)).resolves.toBeNull();
    expect(prisma.sourceResume.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: now } },
    });
  });

  it("refuses to lay out an unstructured resume instead of guessing", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue({ ...resumeRow, structuredFacts: null });
    const service = new DocumentsService(prisma as never, () => now);

    await expect(service.renderCv(resumeRow.id)).rejects.toBeInstanceOf(
      ResumeNotStructuredForDocumentError,
    );
  });

  it("falls back to a neutral filename when the resume has no readable name", async () => {
    const prisma = createPrisma();
    prisma.sourceResume.findFirst.mockResolvedValue({
      ...resumeRow,
      structuredFacts: { ...structuredFacts, identity: {} },
    });
    const service = new DocumentsService(prisma as never, () => now);

    const result = await service.renderCv(resumeRow.id);
    expect(result?.fileName).toBe("cv.pdf");
  });
});
