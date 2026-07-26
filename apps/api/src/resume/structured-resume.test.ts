import { describe, expect, it } from "vitest";

import { structuredResumeSchema } from "./structured-resume.js";

describe("structuredResumeSchema", () => {
  it("accepts factual CV data with missing optional fields omitted", () => {
    const parsed = structuredResumeSchema.parse({
      facts: {
        identity: {
          fullName: "Marie Martin",
          title: "Developpeuse Python",
        },
        education: [
          {
            school: "INGETIS",
            degree: "Bachelor developpement",
            startDate: "2024",
          },
        ],
        experiences: [
          {
            title: "Developpeuse back-end",
            company: "Datalia",
            startDate: "2025-01",
            skills: ["Python", "Django"],
          },
        ],
        projects: [
          {
            name: "Findit",
            description: "Agregateur d'offres d'alternance",
            skills: ["NestJS", "PostgreSQL"],
          },
        ],
        skills: [
          { name: "Python", category: "programming_language" },
          { name: "Django", category: "framework" },
        ],
        languages: [{ name: "Francais", level: "Courant" }],
        certifications: [],
        links: [],
      },
      warnings: ["Adresse e-mail absente du CV."],
      confidence: 82,
    });

    expect(parsed.facts.identity.email).toBeUndefined();
    // L'identite est requise : la grammaire du modele doit au moins l'ouvrir.
    expect(() =>
      structuredResumeSchema.parse({
        facts: {
          education: [],
          experiences: [],
          projects: [],
          skills: [],
          languages: [],
          certifications: [],
          links: [],
        },
        warnings: [],
        confidence: 50,
      }),
    ).toThrow();
    expect(parsed.facts.skills).toHaveLength(2);
    expect(parsed.confidence).toBe(82);
  });

  it("accepts links and dates exactly as real resumes write them", () => {
    // Cas payé sur un vrai CV : liens sans protocole et « date » en phrase.
    const parsed = structuredResumeSchema.parse({
      facts: {
        identity: { fullName: "Daniel Test" },
        education: [
          {
            school: "INGETIS",
            degree: "Mastère Développement Full-Stack",
            endDate: "admission prévue, rentrée 2026 - alternance 24 mois",
          },
        ],
        experiences: [],
        projects: [
          { name: "Thebarber", url: "github.com/Nagoloum/Thebarber", skills: [] },
          { name: "Portfolio", url: "https://nagoloum.vercel.app", skills: [] },
        ],
        skills: [],
        languages: [],
        certifications: [],
        links: [{ label: "LinkedIn", url: "linkedin.com/in/nagoloum" }],
      },
      warnings: [],
      confidence: 90,
    });

    expect(parsed.facts.projects[0]?.url).toBe("github.com/Nagoloum/Thebarber");

    // Une non-adresse reste refusée : la tolérance ne devient pas du laisser-passer.
    expect(() =>
      structuredResumeSchema.parse({
        facts: {
          identity: {},
          education: [],
          experiences: [],
          projects: [{ name: "X", url: "pas une adresse du tout", skills: [] }],
          skills: [],
          languages: [],
          certifications: [],
          links: [],
        },
        warnings: [],
        confidence: 90,
      }),
    ).toThrow();
  });

  it("rejects unknown fields instead of storing model inventions", () => {
    expect(() =>
      structuredResumeSchema.parse({
        facts: {
          identity: { fullName: "Marie Martin", inventedSeniority: "Senior" },
          education: [],
          experiences: [],
          projects: [],
          skills: [],
          languages: [],
          certifications: [],
          links: [],
        },
        warnings: [],
        confidence: 90,
      }),
    ).toThrow();
  });
});
