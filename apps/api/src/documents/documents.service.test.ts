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
  normalizedTitle: "developpeur",
  roleCategory: "FRONTEND",
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

  it("réordonne les compétences pour mettre en tête celles que l'offre nomme", async () => {
    const { profileService, service } = createDeps();
    profileService.get.mockResolvedValue({
      ...profile(),
      skills: ["css", "typescript", "react"],
    });
    renderMock.renderCvPdf.mockResolvedValue(Buffer.from("%PDF"));

    await service.generateCv({ jobSlug: "dev-acme" });

    const data = renderMock.renderCvPdf.mock.calls[0]?.[0] as { skills: { name: string }[] };
    // « typescript » est nommé par l'offre : il passe en tête, sans rien ajouter.
    expect(data.skills.map((skill) => skill.name)).toEqual(["typescript", "css", "react"]);
  });

  it("réordonne les expériences pour mettre en tête celles qui touchent l'offre", async () => {
    const { profileService, service } = createDeps();
    profileService.get.mockResolvedValue({
      ...profile(),
      skills: ["typescript"],
      experiences: [
        {
          title: "Développeuse CSS",
          company: "X",
          period: "2022",
          description: "Mise en page CSS.",
        },
        {
          title: "Développeuse TypeScript",
          company: "Y",
          period: "2024",
          description: "Applications TypeScript.",
        },
      ],
    });
    renderMock.renderCvPdf.mockResolvedValue(Buffer.from("%PDF"));

    await service.generateCv({ jobSlug: "dev-acme" });

    const data = renderMock.renderCvPdf.mock.calls[0]?.[0] as { experiences: { title: string }[] };
    expect(data.experiences.map((experience) => experience.title)).toEqual([
      "Développeuse TypeScript",
      "Développeuse CSS",
    ]);
  });

  it("reformule les réalisations et les attache aux expériences", async () => {
    const { service } = createDeps();
    aiMock.generateStructured.mockResolvedValue({
      experiences: [{ title: "Dev", achievements: ["Développé une application TypeScript."] }],
    });
    renderMock.renderCvPdf.mockResolvedValue(Buffer.from("%PDF"));

    await service.generateCv({ jobSlug: "dev-acme" });

    const data = renderMock.renderCvPdf.mock.calls[0]?.[0] as {
      experiences: { title: string; achievements: string[] }[];
    };
    expect(data.experiences[0]?.achievements).toEqual(["Développé une application TypeScript."]);
  });

  it("écarte une réalisation qui cite une technologie inconnue du profil", async () => {
    const { service } = createDeps();
    aiMock.generateStructured.mockResolvedValue({
      experiences: [
        {
          title: "Dev",
          achievements: ["Développé en Java.", "Développé une application TypeScript."],
        },
      ],
    });
    renderMock.renderCvPdf.mockResolvedValue(Buffer.from("%PDF"));

    await service.generateCv({ jobSlug: "dev-acme" });

    const data = renderMock.renderCvPdf.mock.calls[0]?.[0] as {
      experiences: { achievements: string[] }[];
    };
    expect(data.experiences[0]?.achievements).toEqual(["Développé une application TypeScript."]);
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

  it("refuse un document généré vide plutôt que de le renvoyer", async () => {
    const { service } = createDeps();
    renderMock.renderCvPdf.mockResolvedValue(Buffer.from(""));

    await expect(service.generateCv({ jobSlug: "dev-acme" })).rejects.toThrow("vide");
  });
});

describe("DocumentsService - score du CV", () => {
  it("score le CV du profil contre l'offre, sans appel IA", async () => {
    const { service } = createDeps();

    const result = await service.scoreCv("dev-acme");

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.matchedSkills).toContain("TypeScript");
    // Aucun appel de modèle : le score est purement déterministe.
    expect(aiMock.generateStructured).not.toHaveBeenCalled();
    expect(aiMock.generateText).not.toHaveBeenCalled();
  });

  it("lève 404 pour une offre introuvable", async () => {
    const { prisma, service } = createDeps();
    prisma.job.findFirst.mockResolvedValue(null);

    await expect(service.scoreCv("inconnu")).rejects.toThrow("n'existe pas");
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

  it("relance une fois quand le modèle invente, puis réussit avec des faits ancrés", async () => {
    const { service } = createDeps();
    aiMock.generateStructured
      .mockResolvedValueOnce({
        subject: "Candidature",
        paragraphs: ["Je maîtrise Java."],
        warnings: [],
      })
      .mockResolvedValueOnce({
        subject: "Candidature au poste de développeur",
        paragraphs: ["Je maîtrise TypeScript."],
        warnings: [],
      });
    renderMock.renderCoverLetterPdf.mockResolvedValue(Buffer.from("%PDF"));

    const result = await service.generateLetter({ jobSlug: "dev-acme" });

    expect(result.fileName).toBe("lettre-dev-acme.pdf");
    expect(aiMock.generateStructured).toHaveBeenCalledTimes(2);
    // La seconde consigne interdit explicitement la compétence inventée.
    const system = aiMock.generateStructured.mock.calls[1]?.[0] as { system: string };
    expect(system.system).toContain("Java");
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
