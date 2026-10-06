import { describe, expect, it } from "vitest";

import type { JobOffer } from "./schema.js";
import { looksLikeSchool } from "./school.js";

const offer = (overrides: Partial<JobOffer> = {}): JobOffer => ({
  title: "Développeur full-stack",
  company: "Acme",
  technologies: ["TypeScript"],
  applicationUrl: "https://acme.example/jobs/1",
  sourceUrl: "https://acme.example/jobs/1",
  sourceDomain: "acme.example",
  ...overrides,
});

describe("looksLikeSchool", () => {
  it("détecte une formation dans le titre", () => {
    expect(looksLikeSchool(offer({ title: "Formation développeur web" }))).toBe(true);
  });

  it("détecte une école dans le nom de l'entreprise", () => {
    expect(looksLikeSchool(offer({ company: "École 42" }))).toBe(true);
  });

  it("détecte un bootcamp dans le titre", () => {
    expect(looksLikeSchool(offer({ title: "Bootcamp data science" }))).toBe(true);
  });

  it("détecte un campus dans le nom de l'entreprise", () => {
    expect(looksLikeSchool(offer({ company: "Le Campus Numérique" }))).toBe(true);
  });

  it("détecte une tournure d'école dans la description", () => {
    expect(
      looksLikeSchool(offer({ description: "Rejoignez notre école et obtenez un diplôme." })),
    ).toBe(true);
  });

  it("n'écarte pas une offre dont le diplôme n'est qu'un prérequis", () => {
    expect(
      looksLikeSchool(
        offer({ description: "Diplôme bac+5 en informatique requis pour ce poste." }),
      ),
    ).toBe(false);
  });

  it("n'écarte pas une offre d'emploi ordinaire", () => {
    expect(looksLikeSchool(offer({}))).toBe(false);
  });
});
