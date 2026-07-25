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

    expect(parsed.facts.identity?.email).toBeUndefined();
    expect(parsed.facts.skills).toHaveLength(2);
    expect(parsed.confidence).toBe(82);
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
