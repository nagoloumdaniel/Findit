import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { matchParamsSchema } from "./matching-input.js";
import { MatchingController } from "./matching.controller.js";
import { ResumeNotStructuredError, type MatchView } from "./matching.service.js";

const params = {
  id: "3f1d3f44-0000-7000-8000-000000000001",
  slug: "alternance-developpeur-front-end-paris-75",
};

const view: MatchView = {
  job: { slug: params.slug, title: "Alternance Développeur Front-End", companyName: "Acme" },
  score: 80,
  scoreBreakdown: [],
  matchedSkills: ["TypeScript"],
  missingSkills: [],
  missingKeywords: [],
  strengths: [],
  weaknesses: [],
  recommendations: [],
  confidence: 70,
  insufficientDataWarning: null,
  computedAt: new Date("2026-07-25T10:00:01.000Z"),
};

const createController = (over: Partial<Record<"compute" | "list", unknown>> = {}) => {
  const service = {
    compute: vi.fn().mockResolvedValue(view),
    list: vi.fn().mockResolvedValue([view]),
    ...over,
  };
  return { controller: new MatchingController(service as never), service };
};

describe("MatchingController.compute", () => {
  it("returns the stored match view", async () => {
    const { controller, service } = createController();

    await expect(controller.compute(params)).resolves.toBe(view);
    expect(service.compute).toHaveBeenCalledWith(params.id, params.slug);
  });

  it("maps resume_not_found and job_not_found to 404", async () => {
    const { controller } = createController({
      compute: vi.fn().mockResolvedValue("resume_not_found"),
    });
    await expect(controller.compute(params)).rejects.toBeInstanceOf(NotFoundException);

    const { controller: second } = createController({
      compute: vi.fn().mockResolvedValue("job_not_found"),
    });
    await expect(second.compute(params)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps an unstructured resume to 409, with the remedy in the message", async () => {
    const { controller } = createController({
      compute: vi.fn().mockRejectedValue(new ResumeNotStructuredError()),
    });

    const rejection = expect(controller.compute(params)).rejects;
    await rejection.toBeInstanceOf(ConflictException);
    await expect(controller.compute(params)).rejects.toThrow(/structure/);
  });
});

describe("MatchingController.list", () => {
  it("returns stored matches", async () => {
    const { controller, service } = createController();

    await expect(controller.list({ id: params.id })).resolves.toEqual([view]);
    expect(service.list).toHaveBeenCalledWith(params.id);
  });

  it("maps a dead resume to 404", async () => {
    const { controller } = createController({
      list: vi.fn().mockResolvedValue("resume_not_found"),
    });

    await expect(controller.list({ id: params.id })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("matchParamsSchema", () => {
  it("accepts a UUID and a public-list slug", () => {
    expect(matchParamsSchema.parse(params)).toEqual(params);
  });

  it("rejects anything that is not a UUID or a strict slug", () => {
    expect(() => matchParamsSchema.parse({ ...params, id: "not-a-uuid" })).toThrow();
    expect(() => matchParamsSchema.parse({ ...params, slug: "Slug Invalide" })).toThrow();
    expect(() => matchParamsSchema.parse({ ...params, slug: "dev/../../etc" })).toThrow();
  });
});
