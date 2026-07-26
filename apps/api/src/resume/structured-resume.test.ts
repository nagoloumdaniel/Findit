import { describe, expect, it } from "vitest";

import { sanitizeDatesAgainstSource, structuredResumeSchema } from "./structured-resume.js";
import type { ResumeFacts } from "./structured-resume.js";

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

  it("never keeps a date more precise than the resume wrote", () => {
    // Cas payé sur le modèle réel : « 2025 » devenait « 2025-01-01 ».
    const facts: ResumeFacts = {
      identity: {},
      education: [{ school: "INGETIS", startDate: "2024-09-01", endDate: "2026" }],
      experiences: [
        {
          title: "Stage",
          startDate: "avril 2026",
          endDate: "2026-06-30",
          achievements: [],
          skills: [],
        },
      ],
      projects: [],
      skills: [],
      languages: [],
      certifications: [{ name: "Cert", date: "2031-05-12" }],
      links: [],
    };
    const source =
      "Stage développeur, avril - juin 2026. Bachelor INGETIS 2024 - 2026. Certification Cert.";

    const { facts: fixed, warnings } = sanitizeDatesAgainstSource(facts, source);

    // « avril 2026 » : tous les mots sont écrits dans le CV, gardée telle quelle.
    expect(fixed.experiences[0]?.startDate).toBe("avril 2026");
    // Précision inventée : ramenée à l'année réellement écrite.
    expect(fixed.experiences[0]?.endDate).toBe("2026");
    expect(fixed.education[0]?.startDate).toBe("2024");
    expect(fixed.education[0]?.endDate).toBe("2026");
    // Année introuvable dans le CV : la date disparaît plutôt que de mentir.
    expect(fixed.certifications[0]?.date).toBeUndefined();
    expect(warnings.length).toBe(3);
    expect(warnings.join(" ")).toContain("devient");
    expect(warnings.join(" ")).toContain("retirée");
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
