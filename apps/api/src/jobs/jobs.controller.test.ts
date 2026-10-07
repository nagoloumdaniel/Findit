import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { JobsController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";
import type { JobDetail, JobFilters, JobList, JobStats } from "./jobs.service.js";

/*
 * Le service est remplacé : ce qui est éprouvé ici, c'est le routage, la
 * validation des paramètres de requête et le contrat HTTP. La requête Prisma
 * elle-même est couverte par `jobs.service.test.ts`.
 */
const jobList: JobList = { items: [], total: 0, page: 1, pageSize: 20 };

const jobStats: JobStats = { publishedLast24h: 2, publishedLast72h: 5, lastPublishedAt: null };

const jobFilters: JobFilters = { roles: [], contracts: [], departments: [], workModes: [] };

/*
 * Forme réduite mais suffisante pour prouver que le contrôleur rend ce que le
 * service lui donne, sans le remodeler.
 */
const jobDetail = { slug: "mon-offre-2026", title: "Développeur" } as JobDetail;

const service = {
  list: vi.fn<JobsService["list"]>(),
  stats: vi.fn<JobsService["stats"]>(),
  filters: vi.fn<JobsService["filters"]>(),
  findBySlug: vi.fn<JobsService["findBySlug"]>(),
};

describe("JobsController", () => {
  let app: NestFastifyApplication | undefined;

  beforeEach(async () => {
    vi.resetAllMocks();
    service.list.mockResolvedValue(jobList);
    service.stats.mockResolvedValue(jobStats);
    service.filters.mockResolvedValue(jobFilters);
    service.findBySlug.mockResolvedValue(jobDetail);

    const moduleRef = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [{ provide: JobsService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("passe la pagination au service, coercition comprise", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/jobs?page=3&pageSize=5&freshness=LAST_24H",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(jobList);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, pageSize: 5, freshness: "LAST_24H" }),
    );

    // Le pipe a bien converti les chaînes de l'URL en nombres.
    const query = service.list.mock.calls[0]?.[0];
    expect(typeof query?.page).toBe("number");
    expect(typeof query?.pageSize).toBe("number");
  });

  it("applique les défauts de la fenêtre publique", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/jobs" });

    expect(response.statusCode).toBe(200);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ freshness: "LAST_72H", sort: "DATE", page: 1, pageSize: 20 }),
    );
  });

  it("refuse une pagination hors bornes sans appeler le service", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/jobs?pageSize=999" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(service.list).not.toHaveBeenCalled();
  });

  it("refuse une fenêtre de fraîcheur inconnue", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/jobs?freshness=LAST_30D" });

    expect(response.statusCode).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("sert /stats sans le confondre avec un slug", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/jobs/stats" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(jobStats);
    expect(service.stats).toHaveBeenCalledOnce();
    // Si la route à paramètre passait en premier, « stats » serait pris pour un slug.
    expect(service.findBySlug).not.toHaveBeenCalled();
  });

  it("sert /filters pour la fenêtre demandée, sans slug", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/jobs/filters?freshness=LAST_24H",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(jobFilters);
    expect(service.filters).toHaveBeenCalledWith("LAST_24H");
    expect(service.findBySlug).not.toHaveBeenCalled();
  });

  it("applique la fenêtre par défaut aux facettes", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/jobs/filters" });

    expect(response.statusCode).toBe(200);
    expect(service.filters).toHaveBeenCalledWith("LAST_72H");
  });

  it("passe le slug et la fraîcheur au détail", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/jobs/mon-offre-2026?freshness=LAST_24H",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(jobDetail);
    expect(service.findBySlug).toHaveBeenCalledWith("mon-offre-2026", "LAST_24H");
  });

  it("rend 404 quand l'offre n'existe pas, avec la raison", async () => {
    service.findBySlug.mockResolvedValue(null);

    const response = await app!.inject({ method: "GET", url: "/api/jobs/mon-offre-2026" });

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain("Cette offre n'est pas disponible.");
    expect(response.body).toContain("expiré");
  });

  it("refuse un slug hors forme avec un 400 lisible, pas un 500", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/jobs/Pas_Un_Slug" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(service.findBySlug).not.toHaveBeenCalled();
  });
});
