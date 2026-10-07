import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { PROFILE_INTERNAL_KEY, ProfileController, ProfileKeyGuard } from "./profile.controller.js";
import { ProfileService } from "./profile.service.js";
import type { ProfileInput, ProfileView } from "./profile.service.js";

const INTERNAL_KEY = "test-internal-key-0123456789abcdef";

const emptyProfile: ProfileView = {
  fullName: "",
  headline: null,
  email: null,
  phone: null,
  city: null,
  links: [],
  skills: [],
  languages: [],
  experiences: [],
  cvText: null,
  updatedAt: null,
};

/*
 * Le module de test ne monte ni Prisma ni la base : le service est remplacé. Ce
 * qui est éprouvé ici, c'est la porte d'accès et le contrat HTTP, pas la
 * persistance (couverte par `profile.service.test.ts`).
 */
describe("ProfileController", () => {
  let app: NestFastifyApplication | undefined;
  const service = { get: vi.fn(), save: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    service.get.mockResolvedValue(emptyProfile);
    service.save.mockImplementation((input: ProfileInput) =>
      Promise.resolve({
        ...emptyProfile,
        ...input,
        updatedAt: "2026-10-07T04:00:00.000Z",
      }),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        { provide: ProfileService, useValue: service },
        { provide: PROFILE_INTERNAL_KEY, useValue: INTERNAL_KEY },
        ProfileKeyGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("refuse GET sans clé interne", async () => {
    const response = await app!.inject({ method: "GET", url: "/api/profile" });

    expect(response.statusCode).toBe(401);
    expect(service.get).not.toHaveBeenCalled();
  });

  it("refuse GET avec une mauvaise clé interne", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/profile",
      headers: { "x-internal-key": "mauvaise-cle" },
    });

    expect(response.statusCode).toBe(401);
    expect(service.get).not.toHaveBeenCalled();
  });

  it("rend la forme vide avec la bonne clé, jamais 404", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/profile",
      headers: { "x-internal-key": INTERNAL_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(emptyProfile);
  });

  it("refuse PUT sans clé interne, même avec un corps invalide (401 avant 400)", async () => {
    const response = await app!.inject({
      method: "PUT",
      url: "/api/profile",
      headers: { "content-type": "application/json" },
      payload: { links: "pas-un-tableau" },
    });

    expect(response.statusCode).toBe(401);
    expect(service.save).not.toHaveBeenCalled();
  });

  it("refuse un corps invalide", async () => {
    const response = await app!.inject({
      method: "PUT",
      url: "/api/profile",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      payload: { links: [{ label: 1, url: "https://example.com" }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(service.save).not.toHaveBeenCalled();
  });

  it("fait l'aller-retour d'écriture et rend le profil enregistré", async () => {
    const payload = {
      fullName: "Ada Lovelace",
      headline: "Ingénieure",
      email: "ada@example.com",
      phone: null,
      city: "Paris",
      links: [{ label: "GitHub", url: "https://github.com/ada" }],
      skills: ["typescript"],
      languages: [{ name: "français", level: "natif" }],
      experiences: [{ title: "Dev", company: "Acme", period: "2024", description: "desc" }],
      cvText: "un CV",
    };

    const response = await app!.inject({
      method: "PUT",
      url: "/api/profile",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(service.save).toHaveBeenCalledWith(payload);
    expect(response.json()).toMatchObject({ ...payload, updatedAt: "2026-10-07T04:00:00.000Z" });
  });
});
