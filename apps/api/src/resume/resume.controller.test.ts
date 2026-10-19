import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { SessionGuard } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { ResumeController } from "./resume.controller.js";
import { ResumeService } from "./resume.service.js";

const importResult = {
  facts: {
    identity: {},
    education: [],
    experiences: [],
    projects: [],
    skills: [],
    languages: [],
    certifications: [],
    links: [],
  },
  confidence: 80,
  warnings: [],
};

describe("ResumeController", () => {
  let app: NestFastifyApplication | undefined;
  const service = { import: vi.fn() };
  const auth = { authenticate: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    service.import.mockResolvedValue(importResult);
    auth.authenticate.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      role: "CANDIDATE",
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [ResumeController],
      providers: [
        { provide: ResumeService, useValue: service },
        { provide: AuthService, useValue: auth },
        SessionGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("refuse l'import sans session", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/resume/import",
      headers: { "content-type": "application/json" },
      payload: { fileName: "cv.txt", mimeType: "text/plain", contentBase64: "AAAA" },
    });

    expect(response.statusCode).toBe(401);
    expect(service.import).not.toHaveBeenCalled();
  });

  it("refuse un corps invalide avec une session valide", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/resume/import",
      headers: { "content-type": "application/json", authorization: "Bearer jeton" },
      payload: { fileName: "", mimeType: "", contentBase64: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(service.import).not.toHaveBeenCalled();
  });

  it("structure le CV reçu et rattache le propriétaire de la session", async () => {
    const payload = { fileName: "cv.txt", mimeType: "text/plain", contentBase64: "QUJD" };

    const response = await app!.inject({
      method: "POST",
      url: "/api/resume/import",
      headers: { "content-type": "application/json", authorization: "Bearer jeton" },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(service.import).toHaveBeenCalledWith(payload, "user-1");
    expect(response.json()).toMatchObject({ confidence: 80 });
  });
});
