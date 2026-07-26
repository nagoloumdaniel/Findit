import { AiOutputError } from "@findit/ai";
import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { generatedLetterSchema } from "./letters-input.js";
import { LettersController } from "./letters.controller.js";
import {
  LetterInventsFactsError,
  ResumeNotStructuredForLetterError,
  type LetterView,
} from "./letters.service.js";

const params = {
  id: "3f1d3f44-0000-7000-8000-000000000001",
  slug: "alternance-developpeur-front-end-react-paris",
};

const view: LetterView = {
  job: { slug: params.slug, title: "Alternance Front-end", companyName: "Orbit Studio" },
  subject: "Candidature à l'alternance Développeur Front-end React",
  paragraphs: ["Premier paragraphe factuel.", "Second paragraphe factuel."],
  usedFacts: ["BTS SIO"],
  warnings: [],
  generatedAt: new Date("2026-07-26T10:00:05.000Z"),
};

const createController = (
  over: Partial<Record<"generate" | "list" | "renderPdf", unknown>> = {},
) => {
  const service = {
    generate: vi.fn().mockResolvedValue(view),
    list: vi.fn().mockResolvedValue([view]),
    renderPdf: vi
      .fn()
      .mockResolvedValue({ pdf: Buffer.from("%PDF-fake"), fileName: "lettre-test.pdf" }),
    ...over,
  };
  return { controller: new LettersController(service as never), service };
};

describe("LettersController.generate", () => {
  it("returns the stored letter for review", async () => {
    const { controller, service } = createController();
    await expect(controller.generate(params)).resolves.toBe(view);
    expect(service.generate).toHaveBeenCalledWith(params.id, params.slug);
  });

  it("maps not-found unions to 404", async () => {
    const { controller } = createController({
      generate: vi.fn().mockResolvedValue("resume_not_found"),
    });
    await expect(controller.generate(params)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps an unstructured resume to 409", async () => {
    const { controller } = createController({
      generate: vi.fn().mockRejectedValue(new ResumeNotStructuredForLetterError()),
    });
    await expect(controller.generate(params)).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps invented facts and invalid AI output to 502", async () => {
    const { controller } = createController({
      generate: vi.fn().mockRejectedValue(new LetterInventsFactsError(["Docker"])),
    });
    await expect(controller.generate(params)).rejects.toBeInstanceOf(BadGatewayException);

    const { controller: second } = createController({
      generate: vi.fn().mockRejectedValue(new AiOutputError("sortie invalide")),
    });
    await expect(second.generate(params)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe("LettersController.pdf", () => {
  it("streams the letter PDF", async () => {
    const { controller } = createController();
    const file = await controller.pdf(params);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.options.type).toBe("application/pdf");
    expect(file.options.disposition).toContain('filename="lettre-test.pdf"');
  });

  it("maps a missing letter to 404", async () => {
    const { controller } = createController({ renderPdf: vi.fn().mockResolvedValue(null) });
    await expect(controller.pdf(params)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("generatedLetterSchema", () => {
  it("rejects a letter too vague to be worth reading", () => {
    expect(() =>
      generatedLetterSchema.parse({
        subject: "Candidature",
        paragraphs: ["Je suis motivé."],
        usedFacts: [],
        warnings: [],
      }),
    ).toThrow();
  });

  it("accepts a substantial factual letter", () => {
    const parsed = generatedLetterSchema.parse({
      subject: "Candidature à l'alternance Développeur Front-end React",
      paragraphs: [
        "Actuellement en BTS SIO au Lycée Turgot, je prépare une alternance en développement web et votre offre correspond à mon parcours.",
        "Lors de mon stage chez WebAgence, j'ai développé des interfaces React avec TypeScript, ce qui rejoint directement votre stack.",
      ],
    });
    expect(parsed.paragraphs).toHaveLength(2);
    expect(parsed.usedFacts).toEqual([]);
  });
});
