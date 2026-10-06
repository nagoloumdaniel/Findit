import { describe, expect, it } from "vitest";

import type { JobOffer } from "./schema.js";
import { MIN_VALIDATION_SCORE, scoreValidation } from "./validation.js";

const offer = (overrides: Partial<JobOffer> = {}): JobOffer => ({
  title: "Développeur",
  company: "Acme",
  technologies: [],
  applicationUrl: "https://acme.example/jobs/1",
  sourceUrl: "https://acme.example/jobs/1",
  sourceDomain: "acme.example",
  ...overrides,
});

describe("scoreValidation", () => {
  it("donne le score maximal à une offre complète", () => {
    expect(scoreValidation(offer({})).score).toBe(MIN_VALIDATION_SCORE);
  });

  it("pénalise un titre absent", () => {
    const { score, reasons } = scoreValidation(offer({ title: "" }));
    expect(score).toBeLessThan(MIN_VALIDATION_SCORE);
    expect(reasons).toContain("titre absent");
  });

  it("pénalise une entreprise absente", () => {
    const { reasons } = scoreValidation(offer({ company: "   " }));
    expect(reasons).toContain("entreprise absente");
  });

  it("pénalise une URL de candidature invalide", () => {
    const { reasons } = scoreValidation(offer({ applicationUrl: "pas-une-url" }));
    expect(reasons).toContain("URL de candidature invalide");
  });
});
