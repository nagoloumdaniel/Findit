import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { MatchingController } from "./matching.controller.js";
import { MatchingService } from "./matching.service.js";
import type { MatchItem } from "./matching.service.js";

/*
 * Le service réel est monté avec un Prisma factice : l'historique est construit
 * par le service, et c'est précisément là que vit la minimisation du CV. Un
 * service simulé ne prouverait rien sur ce point, il ne ferait que rendre ce
 * qu'on lui donne.
 */
const SECRET_CV = "CV confidentiel d'Ada — ne doit jamais sortir de l'historique";

const matchItem: MatchItem = {
  jobSlug: "dev-acme",
  jobTitle: "Développeur",
  companyName: "Acme",
  score: 82,
  relevance: "forte",
  matchedSkills: ["typescript"],
  missingSkills: [],
  strengths: ["expérience"],
  weaknesses: [],
  recommendation: "postuler",
};

const prisma = {
  matchingRun: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
};

describe("MatchingController", () => {
  let app: NestFastifyApplication | undefined;

  beforeEach(async () => {
    vi.restoreAllMocks();
    prisma.matchingRun.findMany.mockReset();
    prisma.matchingRun.findUnique.mockReset();

    const moduleRef = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [MatchingService, { provide: PRISMA_CLIENT, useValue: prisma }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it("passe le CV soumis au service et rend ses résultats", async () => {
    const score = vi.spyOn(app!.get(MatchingService), "score").mockResolvedValue([matchItem]);

    const response = await app!.inject({
      method: "POST",
      url: "/api/matching/score",
      headers: { "content-type": "application/json" },
      payload: { cvText: "Mon CV" },
    });

    // Aucune ressource n'est créée : la route rend 200, pas le 201 par défaut du POST.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([matchItem]);
    expect(score).toHaveBeenCalledWith("Mon CV");
  });

  it("refuse un CV vide avec un 400, sans appeler le service", async () => {
    const score = vi.spyOn(app!.get(MatchingService), "score").mockResolvedValue([]);

    const response = await app!.inject({
      method: "POST",
      url: "/api/matching/score",
      headers: { "content-type": "application/json" },
      payload: { cvText: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(score).not.toHaveBeenCalled();
  });

  it("refuse un corps sans CV avec un 400, sans appeler le service", async () => {
    const score = vi.spyOn(app!.get(MatchingService), "score").mockResolvedValue([]);

    const response = await app!.inject({
      method: "POST",
      url: "/api/matching/score",
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(score).not.toHaveBeenCalled();
  });

  it("rend l'historique sans jamais exposer le CV", async () => {
    /*
     * La ligne factice porte `cvText` : si le service recopiait la ligne au lieu
     * de la réduire, le champ ressortirait et ce test échouerait.
     */
    prisma.matchingRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        createdAt: new Date("2026-10-07T01:00:00.000Z"),
        jobCount: 15,
        bestScore: 55,
        cvText: SECRET_CV,
      },
    ]);

    const response = await app!.inject({ method: "GET", url: "/api/matching/history" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: "run-1", createdAt: "2026-10-07T01:00:00.000Z", jobCount: 15, bestScore: 55 },
    ]);
    // Ni le nom du champ, ni le contenu du CV ne sortent de la route publique.
    expect(response.body).not.toContain("cvText");
    expect(response.body).not.toContain(SECRET_CV);

    // La minimisation commence à la requête : le CV n'est même pas lu.
    const call = prisma.matchingRun.findMany.mock.calls[0]?.[0] as {
      select: Record<string, boolean>;
    };
    expect(call.select.cvText).toBeUndefined();
  });

  it("rend le détail d'un matching passé, CV compris, pour l'identifiant demandé", async () => {
    prisma.matchingRun.findUnique.mockResolvedValue({
      id: "run-2",
      createdAt: new Date("2026-10-06T22:00:00.000Z"),
      jobCount: 3,
      bestScore: 88,
      cvText: SECRET_CV,
      items: [matchItem],
    });

    const response = await app!.inject({ method: "GET", url: "/api/matching/history/run-2" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "run-2",
      createdAt: "2026-10-06T22:00:00.000Z",
      jobCount: 3,
      bestScore: 88,
      cvText: SECRET_CV,
      items: [matchItem],
    });
    expect(prisma.matchingRun.findUnique).toHaveBeenCalledWith({ where: { id: "run-2" } });
  });

  it("rend 404 pour un matching inconnu, comme pour un run inconnu", async () => {
    prisma.matchingRun.findUnique.mockResolvedValue(null);

    const response = await app!.inject({ method: "GET", url: "/api/matching/history/inconnu" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: "Ce matching n'existe pas." });
    expect(prisma.matchingRun.findUnique).toHaveBeenCalledWith({ where: { id: "inconnu" } });
  });

  it("refuse un identifiant hors forme avec un 400, sans interroger la base", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/matching/history/Pas_Inconnu",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(prisma.matchingRun.findUnique).not.toHaveBeenCalled();
  });
});
