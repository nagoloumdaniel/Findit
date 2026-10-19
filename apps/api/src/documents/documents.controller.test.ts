import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFastifyAdapter } from "../fastify-adapter.js";
import { PROFILE_INTERNAL_KEY, ProfileKeyGuard } from "../profile/profile.controller.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsService } from "./documents.service.js";

vi.mock("@findit/documents", () => ({
  isValidHexColor: (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value),
}));

const INTERNAL_KEY = "test-internal-key-0123456789abcdef";

const cvFile = {
  buffer: Buffer.from("%PDF-1.4"),
  contentType: "application/pdf",
  fileName: "cv-dev-acme.pdf",
};

describe("DocumentsController", () => {
  let app: NestFastifyApplication | undefined;
  const service = { generateCv: vi.fn(), generateLetter: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    service.generateCv.mockResolvedValue(cvFile);
    service.generateLetter.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.4"),
      contentType: "application/pdf",
      fileName: "lettre-dev-acme.pdf",
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: service },
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

  it("refuse la génération du CV sans clé interne", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/documents/cv",
      headers: { "content-type": "application/json" },
      payload: { jobSlug: "dev-acme" },
    });

    expect(response.statusCode).toBe(401);
    expect(service.generateCv).not.toHaveBeenCalled();
  });

  it("rend le CV en pièce jointe avec la bonne clé", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/documents/cv",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      payload: { jobSlug: "dev-acme", template: "moderne", accentColor: "#d4af37" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="cv-dev-acme.pdf"');
    expect(response.rawPayload.length).toBeGreaterThan(0);
    expect(service.generateCv).toHaveBeenCalledWith({
      jobSlug: "dev-acme",
      template: "moderne",
      accentColor: "#d4af37",
    });
  });

  it("refuse un corps invalide avec la bonne clé", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/documents/cv",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      payload: { jobSlug: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: "Paramètres de requête invalides" });
    expect(service.generateCv).not.toHaveBeenCalled();
  });

  it("rend la lettre en pièce jointe avec la bonne clé", async () => {
    const response = await app!.inject({
      method: "POST",
      url: "/api/documents/letter",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      payload: { jobSlug: "dev-acme" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(service.generateLetter).toHaveBeenCalledWith({ jobSlug: "dev-acme" });
  });
});
