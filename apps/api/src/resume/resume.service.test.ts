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

const createPrisma = () => {
  const resume = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn().mockResolvedValue({ id: "resume-1" }),
    update: vi.fn().mockResolvedValue({ id: "resume-1" }),
    findUnique: vi.fn().mockResolvedValue({ id: "resume-1" }),
    findMany: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({ id: "resume-1" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = {
    modelCall: { create: vi.fn().mockResolvedValue({ id: "call-1" }) },
    resume,
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return prisma;
};

const txtBody = (text: string): { fileName: string; mimeType: string; contentBase64: string } => ({
  fileName: "cv.txt",
  mimeType: "text/plain",
  contentBase64: Buffer.from(text, "utf8").toString("base64"),
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ResumeService - import", () => {
  it("structure un TXT, le conserve et journalise le coût", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never);
    aiMock.generateStructured.mockResolvedValue(structuredResult());

    const result = await service.import(txtBody("Développeur TypeScript depuis 2025"));

    expect(result.confidence).toBe(85);
    expect(result.facts.skills).toEqual([{ name: "typescript", category: "programming_language" }]);
    expect(result.resumeId).toBe("resume-1");
    expect(aiMock.generateStructured).toHaveBeenCalledOnce();

    // Le CV est conservé comme version active : les autres sont désactivés.
    expect(prisma.resume.updateMany).toHaveBeenCalledWith({
      where: { active: true },
      data: { active: false },
    });
    expect(prisma.resume.create).toHaveBeenCalledOnce();

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

describe("ResumeService - versions", () => {
  it("liste les CV conservés sans leur contenu", async () => {
    const prisma = createPrisma();
    prisma.resume.findMany.mockResolvedValue([
      {
        id: "r-1",
        fileName: "cv.pdf",
        fileType: "pdf",
        confidence: 80,
        active: true,
        createdAt: new Date("2026-10-19T00:00:00.000Z"),
      },
    ]);
    const service = new ResumeService(prisma as never);

    const list = await service.list();

    expect(list).toEqual([
      {
        id: "r-1",
        fileName: "cv.pdf",
        fileType: "pdf",
        confidence: 80,
        active: true,
        createdAt: "2026-10-19T00:00:00.000Z",
      },
    ]);
    expect(prisma.resume.findMany).toHaveBeenCalled();
    // La liste ne charge jamais le texte extrait : minimisation de la donnée.
    const call = prisma.resume.findMany.mock.calls[0]?.[0] as {
      select: Record<string, boolean>;
    };
    expect(call.select.extractedText).toBeUndefined();
  });

  it("active un CV et signale un identifiant inconnu", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never);

    await service.activate("r-1");
    expect(prisma.resume.update).toHaveBeenCalledWith({
      where: { id: "r-1" },
      data: { active: true },
    });

    prisma.resume.findUnique.mockResolvedValue(null);
    await expect(service.activate("inconnu")).rejects.toThrow("n'existe pas");
  });

  it("supprime un CV et signale un identifiant inconnu", async () => {
    const prisma = createPrisma();
    const service = new ResumeService(prisma as never);

    await service.remove("r-1");
    expect(prisma.resume.delete).toHaveBeenCalledWith({ where: { id: "r-1" } });

    prisma.resume.delete.mockRejectedValue(new Error("absent"));
    await expect(service.remove("inconnu")).rejects.toThrow("n'existe pas");
  });
});
