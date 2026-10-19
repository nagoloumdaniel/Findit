import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le service construit son modèle et appelle l'extraction réels : on remplace
 * le modèle pour éprouver la structuration et la journalisation sans réseau.
 */
const { aiMock } = vi.hoisted(() => ({
  aiMock: {
    usage: () => ({ inputTokens: 0, outputTokens: 0, calls: 0 }),
    generateStructured: vi.fn(),
  },
}));

vi.mock("@findit/ai", () => ({
  createDeepSeekModel: () => aiMock,
  computeCostMicroUsd: () => 0,
}));

const { ResumeService } = await import("./resume.service.js");

const structuredResult = () => ({
  facts: {
    identity: {},
    education: [],
    experiences: [],
    projects: [],
    skills: [{ name: "typescript", category: "programming_language" }],
    languages: [],
    certifications: [],
    links: [],
  },
  warnings: [],
  confidence: 85,
});

const createPrisma = () => ({
  modelCall: { create: vi.fn().mockResolvedValue({ id: "call-1" }) },
});

const txtBody = (text: string): { fileName: string; mimeType: string; contentBase64: string } => ({
  fileName: "cv.txt",
  mimeType: "text/plain",
  contentBase64: Buffer.from(text, "utf8").toString("base64"),
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ResumeService - import", () => {
  it("structure un TXT et journalise le coût sans écrire de profil", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never);
    aiMock.generateStructured.mockResolvedValue(structuredResult());

    const result = await service.import(txtBody("Développeur TypeScript depuis 2025"));

    expect(result.confidence).toBe(85);
    expect(result.facts.skills).toEqual([{ name: "typescript", category: "programming_language" }]);
    expect(aiMock.generateStructured).toHaveBeenCalledOnce();

    expect(prisma.modelCall.create).toHaveBeenCalledOnce();
    const call = prisma.modelCall.create.mock.calls[0]?.[0] as {
      data: { purpose: string };
    };
    expect(call.data.purpose).toBe("resume-import");
  });

  it("garde-fou : une date inventée par le modèle est ramenée à la source", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never);
    aiMock.generateStructured.mockResolvedValue({
      ...structuredResult(),
      facts: {
        ...structuredResult().facts,
        experiences: [{ title: "Dev", startDate: "2025-01-01", achievements: [], skills: [] }],
      },
    });

    const result = await service.import(txtBody("Développeur depuis 2025"));

    expect(result.facts.experiences[0]?.startDate).toBe("2025");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("refuse un type de fichier non pris en charge", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never);

    await expect(
      service.import({ fileName: "photo.png", mimeType: "image/png", contentBase64: "AAAA" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse un contenu vide", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never);

    await expect(service.import(txtBody(""))).rejects.toBeInstanceOf(BadRequestException);
  });
});
