import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { PROFILE_INTERNAL_KEY, ProfileController, ProfileKeyGuard } from "./profile.controller.js";
import { ProfileService } from "./profile.service.js";

const INTERNAL_KEY = "test-internal-key-0123456789abcdef";

/// Une clé de même longueur mais différente : elle force `timingSafeEqual`,
/// que la comparaison de longueur seule court-circuite.
const SAME_LENGTH_WRONG_KEY = "test-internal-key-0123456789abcdeX";

/** Vue minimale de requête acceptée par le garde. */
const requestWith = (headers: Record<string, string | string[] | undefined>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe("ProfileKeyGuard", () => {
  const guard = new ProfileKeyGuard(INTERNAL_KEY);

  it("laisse passer la clé attendue", () => {
    expect(guard.canActivate(requestWith({ "x-internal-key": INTERNAL_KEY }))).toBe(true);
  });

  it("refuse un en-tête absent", () => {
    try {
      guard.canActivate(requestWith({}));
      throw new Error("le garde aurait dû refuser");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      const response = (error as UnauthorizedException).getResponse() as {
        message: string;
        reason: string;
      };
      expect(response.message).toBe("Accès interne requis.");
      expect(response.reason).toContain("x-internal-key");
    }
  });

  it("refuse une clé de longueur différente", () => {
    expect(() => guard.canActivate(requestWith({ "x-internal-key": "mauvaise-cle" }))).toThrow(
      UnauthorizedException,
    );
  });

  it("refuse une clé de même longueur mais différente", () => {
    expect(() =>
      guard.canActivate(requestWith({ "x-internal-key": SAME_LENGTH_WRONG_KEY })),
    ).toThrow(UnauthorizedException);
  });

  it("refuse un en-tête répété, qui n'est pas une chaîne", () => {
    expect(() =>
      guard.canActivate(requestWith({ "x-internal-key": [INTERNAL_KEY, INTERNAL_KEY] })),
    ).toThrow(UnauthorizedException);
  });
});

describe("ProfileController — garde et non-divulgation", () => {
  let app: NestFastifyApplication | undefined;

  const prisma = {
    profile: { findUnique: vi.fn(), upsert: vi.fn() },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.profile.findUnique.mockResolvedValue({
      id: "default",
      fullName: "Ada Lovelace",
      headline: null,
      email: null,
      phone: null,
      city: null,
      links: [],
      skills: ["typescript"],
      languages: [],
      experiences: [],
      cvText: null,
      updatedAt: new Date("2026-10-07T04:00:00.000Z"),
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        ProfileService,
        { provide: PRISMA_CLIENT, useValue: prisma },
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

  it("répond 401 avant 400 pour une clé fausse et un corps invalide", async () => {
    const response = await app!.inject({
      method: "PUT",
      url: "/api/profile",
      headers: { "content-type": "application/json", "x-internal-key": SAME_LENGTH_WRONG_KEY },
      payload: { links: "pas-un-tableau" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ message: "Accès interne requis." });
    // Le service n'a rien vu : l'appelant n'apprend rien sur la validation.
    expect(prisma.profile.upsert).not.toHaveBeenCalled();
  });

  it("répond 401 avant 400 pour un en-tête répété et un corps invalide", async () => {
    const response = await app!.inject({
      method: "PUT",
      url: "/api/profile",
      headers: {
        "content-type": "application/json",
        "x-internal-key": [INTERNAL_KEY, INTERNAL_KEY],
      },
      payload: { links: "pas-un-tableau" },
    });

    expect(response.statusCode).toBe(401);
    expect(prisma.profile.upsert).not.toHaveBeenCalled();
  });

  it("rend le profil sans la clé de ligne ni le secret interne", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/profile",
      headers: { "x-internal-key": INTERNAL_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      fullName: "Ada Lovelace",
      headline: null,
      email: null,
      phone: null,
      city: null,
      links: [],
      skills: ["typescript"],
      languages: [],
      experiences: [],
      cvText: null,
      updatedAt: "2026-10-07T04:00:00.000Z",
    });
    // La clé primaire de la ligne est un détail interne, pas un contrat public.
    expect(response.json()).not.toHaveProperty("id");
    expect(response.body).not.toContain(INTERNAL_KEY);
  });

  it("ne renvoie pas la clé attendue dans le corps d'un refus", async () => {
    const response = await app!.inject({
      method: "GET",
      url: "/api/profile",
      headers: { "x-internal-key": SAME_LENGTH_WRONG_KEY },
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(INTERNAL_KEY);
    expect(response.body).not.toContain(SAME_LENGTH_WRONG_KEY);
  });
});
