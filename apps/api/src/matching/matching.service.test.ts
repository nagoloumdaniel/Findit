import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le service construit son modèle et appelle le matching réels : on les remplace
 * pour éprouver la journalisation sans réseau ni modèle.
 */
const usage = { inputTokens: 100, outputTokens: 50, calls: 1 };
let usageCalls = 0;

vi.mock("@findit/ai", () => ({
  createDeepSeekModel: () => ({
    /*
     * Le vrai modèle accumule : le premier relevé est à zéro, les suivants
     * portent la consommation. Rendre le même objet aux deux appels donnerait un
     * delta nul, et le test passerait pour de mauvaises raisons.
     */
    usage: () => {
      usageCalls += 1;
      return usageCalls === 1 ? { inputTokens: 0, outputTokens: 0, calls: 0 } : { ...usage };
    },
    generateStructured: () => Promise.reject(new Error("modèle non appelé dans ce test")),
  }),
  computeCostMicroUsd: (tokens: { inputTokens: number; outputTokens: number }) =>
    tokens.inputTokens + tokens.outputTokens,
}));

vi.mock("@findit/matching", () => ({
  structureCv: () => Promise.resolve({ skills: ["typescript"] }),
  computeMatch: () =>
    Promise.resolve({
      score: 42,
      relevance: "bonne",
      matchedSkills: ["typescript"],
      missingSkills: [],
      strengths: [],
      weaknesses: [],
      recommendation: "à considérer",
    }),
}));

const { MatchingService } = await import("./matching.service.js");

const job = {
  slug: "dev-acme",
  title: "Développeur",
  description: "desc",
  requirements: ["typescript"],
  contractType: "ALTERNANCE",
  city: "Paris",
  company: { name: "Acme" },
};

const createPrisma = () => ({
  job: { findMany: vi.fn().mockResolvedValue([job]) },
  matchingRun: {
    create: vi.fn().mockResolvedValue({ id: "run-1" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
  },
  modelCall: { create: vi.fn().mockResolvedValue({ id: "call-1" }) },
});

beforeEach(() => {
  usageCalls = 0;
});

describe("MatchingService - historique", () => {
  it("enregistre le matching et purge au-delà de la rétention", async () => {
    const prisma = createPrisma();
    const service = new MatchingService(prisma as never);

    const items = await service.score("un CV");

    expect(items).toHaveLength(1);
    expect(prisma.matchingRun.create).toHaveBeenCalledOnce();
    const created = prisma.matchingRun.create.mock.calls[0]?.[0] as {
      data: { cvText: string; jobCount: number; bestScore: number };
    };
    expect(created.data).toMatchObject({ cvText: "un CV", jobCount: 1, bestScore: 42 });

    // La purge est calculée depuis la rétention réglée (72 h par défaut).
    expect(prisma.matchingRun.deleteMany).toHaveBeenCalledOnce();
    const purge = prisma.matchingRun.deleteMany.mock.calls[0]?.[0] as {
      where: { createdAt: { lt: Date } };
    };
    const ageHours = (Date.now() - purge.where.createdAt.lt.getTime()) / 3_600_000;
    expect(ageHours).toBeGreaterThan(71.9);
    expect(ageHours).toBeLessThan(72.1);
  });

  it("journalise le coût du modèle en plus du matching", async () => {
    const prisma = createPrisma();
    const service = new MatchingService(prisma as never);

    await service.score("un CV");

    expect(prisma.modelCall.create).toHaveBeenCalledOnce();
    const call = prisma.modelCall.create.mock.calls[0]?.[0] as {
      data: { purpose: string; inputTokens: number; outputTokens: number; costMicroUsd: number };
    };
    expect(call.data).toMatchObject({
      purpose: "cv-matching",
      inputTokens: 100,
      outputTokens: 50,
      costMicroUsd: 150,
    });
  });

  it("rend l'historique sans le CV", async () => {
    const prisma = createPrisma();
    prisma.matchingRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        createdAt: new Date("2026-10-07T01:00:00.000Z"),
        jobCount: 15,
        bestScore: 55,
      },
    ]);
    const service = new MatchingService(prisma as never);

    const history = await service.history();

    expect(history).toEqual([
      { id: "run-1", createdAt: "2026-10-07T01:00:00.000Z", jobCount: 15, bestScore: 55 },
    ]);
    const select = prisma.matchingRun.findMany.mock.calls[0]?.[0] as {
      select: Record<string, boolean>;
    };
    expect(select.select.cvText).toBeUndefined();
  });

  it("rend null pour un matching inconnu", async () => {
    const prisma = createPrisma();
    const service = new MatchingService(prisma as never);

    await expect(service.historyDetail("inconnu")).resolves.toBeNull();
  });
});
