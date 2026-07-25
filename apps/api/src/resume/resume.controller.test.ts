import { AiDisabledError, AiOutputError, AiUnavailableError } from "@findit/ai";
import { BadGatewayException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ResumeController } from "./resume.controller.js";

const structuredResumeDetail = {
  id: "018fc9be-67a8-7c86-a3f0-3d61d421d051",
  fileType: "PDF",
  originalFileName: "cv.pdf",
  fileSize: 42,
  textLength: 30,
  extractedText: "Marie Martin\nPython",
  structuredAt: new Date("2026-07-24T11:00:00.000Z"),
  structuredConfidence: 84,
  expiresAt: new Date("2026-07-25T10:00:00.000Z"),
  structured: {
    facts: {
      identity: { fullName: "Marie Martin" },
      education: [],
      experiences: [],
      projects: [],
      skills: [{ name: "Python", category: "programming_language" }],
      languages: [],
      certifications: [],
      links: [],
    },
    warnings: [],
    confidence: 84,
    structuredAt: new Date("2026-07-24T11:00:00.000Z"),
  },
  createdAt: new Date("2026-07-24T10:00:00.000Z"),
};

const createController = (
  overrides: Partial<{
    structure: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  }>,
) =>
  new ResumeController({
    ingest: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    structure: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  } as never);

describe("ResumeController.structure", () => {
  it("returns the structured resume detail", async () => {
    const structure = vi.fn().mockResolvedValue(structuredResumeDetail);
    const controller = createController({ structure });

    await expect(controller.structure({ id: structuredResumeDetail.id })).resolves.toBe(
      structuredResumeDetail,
    );
  });

  it("returns 404 when the source resume does not exist", async () => {
    const controller = createController({ structure: vi.fn().mockResolvedValue(null) });

    await expect(controller.structure({ id: structuredResumeDetail.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns 409 when local AI is disabled", async () => {
    const controller = createController({
      structure: vi.fn().mockRejectedValue(new AiDisabledError("off")),
    });

    await expect(controller.structure({ id: structuredResumeDetail.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("returns 503 when local AI is unavailable", async () => {
    const controller = createController({
      structure: vi.fn().mockRejectedValue(new AiUnavailableError("down")),
    });

    await expect(controller.structure({ id: structuredResumeDetail.id })).rejects.toMatchObject({
      status: 503,
    });
  });

  it("returns 502 when the model output is invalid", async () => {
    const controller = createController({
      structure: vi.fn().mockRejectedValue(new AiOutputError("bad json")),
    });

    await expect(controller.structure({ id: structuredResumeDetail.id })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});

describe("ResumeController.remove", () => {
  it("deletes a source resume", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const controller = createController({ remove });

    await expect(controller.remove({ id: structuredResumeDetail.id })).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(structuredResumeDetail.id);
  });

  it("returns 404 when the source resume is missing", async () => {
    const controller = createController({ remove: vi.fn().mockResolvedValue(false) });

    await expect(controller.remove({ id: structuredResumeDetail.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
