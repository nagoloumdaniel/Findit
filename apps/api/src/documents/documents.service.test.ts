import { beforeEach, describe, expect, it, vi } from "vitest";

const { aiMock } = vi.hoisted(() => ({
  aiMock: {
    usage: () => ({ inputTokens: 0, outputTokens: 0, calls: 0 }),
    generateStructured: vi.fn(),
    generateText: vi.fn(),
  },
}));

const { renderMock } = vi.hoisted(() => ({
  renderMock: {
    renderCvPdf: vi.fn(),
    renderCvDocx: vi.fn(),
    renderCoverLetterPdf: vi.fn(),
    renderCoverLetterDocx: vi.fn(),
  },
}));

vi.mock("@findit/ai", () => ({
  createDeepSeekModel: () => aiMock,
  computeCostMicroUsd: () => 0,
}));

vi.mock("@findit/documents", () => ({
  renderCvPdf: renderMock.renderCvPdf,
  renderCvDocx: renderMock.renderCvDocx,
  renderCoverLetterPdf: renderMock.renderCoverLetterPdf,
  renderCoverLetterDocx: renderMock.renderCoverLetterDocx,
}));

const { DocumentsService, LetterInventsFactsError } = await import("./documents.service.js");

/** Profil rempli, tel que le service le lit. */
const profile = () => ({
  fullName: "Ada Lovelace",
  headline: "Développeuse front-end",
  email: "ada@example.com",
  phone: null,
  city: "Paris",
  links: [],
  skills: ["typescript"],
  languages: [{ name: "Français", level: "natif" }],
  experiences: [{ title: "Dev", company: "Acme", period: "2024", description: "desc" }],
  education: [],
  certifications: [],
  projects: [],
  preferredContracts: [],
  cvText: null,
  updatedAt: "2026-10-07T04:00:00.000Z",
});

const job = {
  slug: "dev-acme",
  title: "Développeur",
  description: "desc",
  requirements: ["typescript"],
  responsibilities: [],
  city: "Paris",
  company: { name: "Acme" },
};

const createDeps = () => {
  const prisma = {
    job: { findFirst: vi.fn().mockResolvedValue(job) },
    modelCall: { create: vi.fn().mockResolvedValue({ id: "call-1" }) },
  };
  const profileService = { get: vi.fn().mockResolvedValue(profile()) };
  const service = new DocumentsService(prisma as never, profileService as never);
  return { prisma, profileService, service };
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("DocumentsService - génération de CV", () => {
  it("rend un PDF à partir des seuls faits réels du profil", async () => {
    const { service } = createDeps();
    renderMock.renderCvPdf.mockResolvedValue(Buffer.from("%PDF-1.4"));

    const result = await service.generateCv({ jobSlug: "dev-acme" });

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.fileName).toBe("cv-dev-acme.pdf");
    expect(result.contentType).toBe("application/pdf");

    const data = renderMock.renderCvPdf.mock.calls[0]?.[0] as {
      skills: { name: string }[];
      identity: { fullName?: string };
    };
    expect(data.identity?.fullName).toBe("Ada Lovelace");
    expect(data.skills).toEqual([{ name: "typescript" }]);
  });

  it("garde absente une compétence absente : rien n'est inventé", async () => {
    const { profileService, service } = createDeps();
    profileService.get.mockResolvedValue({ ...profile(), skills: [] });
    renderMock.renderCvPdf.mockResolvedValue(Buffer.from("%PDF"));

    await service.generateCv({ jobSlug: "dev-acme" });

    const data = renderMock.renderCvPdf.mock.calls[0]?.[0] as { skills: unknown[] };
    expect(data.skills).toEqual([]);
  });

  it("rend un DOCX quand le format le demande", async () => {
    const { service } = createDeps();
    renderMock.renderCvDocx.mockResolvedValue(Buffer.from("PK"));

    const result = await service.generateCv({ jobSlug: "dev-acme", format: "docx" });

    expect(result.fileName).toBe("cv-dev-acme.docx");
    expect(result.contentType).toContain("wordprocessingml");
    expect(renderMock.renderCvDocx).toHaveBeenCalledOnce();
  });

  it("lève 404 pour une offre introuvable", async () => {
    const { prisma, service } = createDeps();
    prisma.job.findFirst.mockResolvedValue(null);

    await expect(service.generateCv({ jobSlug: "inconnu" })).rejects.toThrow("n'existe pas");
  });
});

describe("DocumentsService - génération de lettre", () => {
  it("refuse une lettre qui cite une compétence absente du profil", async () => {
    const { service } = createDeps();
    aiMock.generateStructured.mockResolvedValue({
      subject: "Candidature",
      paragraphs: ["Je maîtrise React et TypeScript."],
      warnings: [],
    });

    await expect(service.generateLetter({ jobSlug: "dev-acme" })).rejects.toBeInstanceOf(
      LetterInventsFactsError,
    );
    expect(renderMock.renderCoverLetterPdf).not.toHaveBeenCalled();
  });

  it("rend la lettre et journalise le coût quand les faits sont ancrés", async () => {
    const { prisma, service } = createDeps();
    aiMock.generateStructured.mockResolvedValue({
      subject: "Candidature au poste de développeur",
      paragraphs: ["Je maîtrise TypeScript."],
      warnings: [],
    });
    renderMock.renderCoverLetterPdf.mockResolvedValue(Buffer.from("%PDF"));

    const result = await service.generateLetter({ jobSlug: "dev-acme" });

    expect(result.fileName).toBe("lettre-dev-acme.pdf");
    expect(renderMock.renderCoverLetterPdf).toHaveBeenCalledOnce();

    expect(prisma.modelCall.create).toHaveBeenCalledOnce();
    const call = prisma.modelCall.create.mock.calls[0]?.[0] as {
      data: { purpose: string };
    };
    expect(call.data.purpose).toBe("document-letter");
  });
});
