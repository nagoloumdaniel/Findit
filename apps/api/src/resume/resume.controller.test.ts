import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { PROFILE_INTERNAL_KEY, ProfileKeyGuard } from "../profile/profile.controller.js";
import { ResumeController } from "./resume.controller.js";
import { ResumeService } from "./resume.service.js";

const INTERNAL_KEY = "test-internal-key-0123456789abcdef";

const importResult = {
  resumeId: "resume-1",
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

  beforeEach(async () => {
    vi.resetAllMocks();
    service.import.mockResolvedValue(importResult);

    const moduleRef = await Test.createTestingModule({
      controllers: [ResumeController],
      providers: [
        { provide: ResumeService, useValue: service },
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

  it("refuse l'import sans clé interne", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/resume/import",
      headers: { "content-type": "application/json" },
      payload: { fileName: "cv.txt", mimeType: "text/plain", contentBase64: "AAAA" },
    });

    expect(response.statusCode).toBe(401);
    expect(service.import).not.toHaveBeenCalled();
  });

  it("refuse un corps invalide avec la bonne clé", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/resume/import",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      payload: { fileName: "", mimeType: "", contentBase64: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(service.import).not.toHaveBeenCalled();
  });

  it("structure le CV reçu et rattache le propriétaire passé en en-tête", async () => {
    const payload = { fileName: "cv.txt", mimeType: "text/plain", contentBase64: "QUJD" };

    const response = await app!.inject({
      method: "POST",
      url: "/api/resume/import",
      headers: {
        "content-type": "application/json",
        "x-internal-key": INTERNAL_KEY,
        "x-user-id": "user-1",
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(service.import).toHaveBeenCalledWith(payload, "user-1");
    expect(response.json()).toMatchObject({ confidence: 80 });
  });
});
