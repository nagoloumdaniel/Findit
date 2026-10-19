import type { CvDocumentData } from "@findit/documents";
import { describe, expect, it } from "vitest";

import { scoreCvDocument, scoreLetterDocument } from "./document-scoring.js";
import type { ScoredJob } from "./document-scoring.js";

const cv = (overrides: Partial<CvDocumentData> = {}): CvDocumentData => ({
  identity: { fullName: "Ada Lovelace", title: "Développeuse front-end" },
  experiences: [{ title: "Développeuse front-end React", skills: ["Git"], achievements: [] }],
  projects: [{ name: "Site vitrine", skills: ["Next.js"], url: undefined }],
  education: [],
  skills: [{ name: "TypeScript" }, { name: "React" }],
  languages: [{ name: "Anglais", level: "B2" }],
  certifications: [],
  links: [],
  ...overrides,
});

const job = (overrides: Partial<ScoredJob> = {}): ScoredJob => ({
  title: "Alternance Développeur Front-End H/F",
  normalizedTitle: "developpeur front end",
  roleCategory: "FRONTEND",
  requirements: ["Maîtrise de TypeScript et React.", "Anglais professionnel apprécié."],
  responsibilities: ["Développer des interfaces avec Next.js."],
  description: "Équipe produit web. Stack React et TypeScript.",
  ...overrides,
});

describe("scoreCvDocument", () => {
  it("note bien un CV qui couvre les exigences, avec le détail explicable", () => {
    const result = scoreCvDocument(cv(), job());

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.matchedSkills).toContain("TypeScript");
    expect(result.matchedSkills).toContain("React");
    // La compétence d'un projet (Next.js) est valorisée comme prouvée.
    expect(result.matchedSkills).toContain("Next.js");
    expect(result.insufficientDataWarning).toBeNull();
    expect(result.breakdown.length).toBeGreaterThan(0);
  });

  it("liste une compétence exigée absente du CV", () => {
    const result = scoreCvDocument(
      cv(),
      job({ requirements: ["Java et Spring exigés.", "TypeScript apprécié."] }),
    );

    expect(result.missingSkills).toContain("Java");
    expect(result.missingSkills).toContain("Spring");
    expect(result.weaknesses.join(" ")).toContain("Java");
  });

  it("avertit plutôt que d'inventer quand le CV est vide", () => {
    const result = scoreCvDocument(
      cv({ skills: [], experiences: [], projects: [], languages: [] }),
      job(),
    );

    expect(result.insufficientDataWarning).not.toBeNull();
    expect(result.confidence).toBeLessThanOrEqual(30);
  });

  it("est déterministe : le même couple redonne le même score", () => {
    expect(scoreCvDocument(cv(), job())).toEqual(scoreCvDocument(cv(), job()));
  });
});

describe("scoreLetterDocument", () => {
  it("mesure l'adéquation par les compétences de l'offre réellement citées", () => {
    const result = scoreLetterDocument(
      "Je maîtrise TypeScript et React, et j'ai l'habitude du travail en équipe.",
      job(),
    );

    expect(result.offerSkills).toContain("TypeScript");
    expect(result.offerSkills).toContain("React");
    expect(result.matchedSkills).toContain("TypeScript");
    expect(result.matchedSkills).toContain("React");
    expect(result.missingSkills).toContain("Next.js");
    expect(result.score).toBeGreaterThan(0);
  });

  it("rend un score faible quand la lettre n'aborde aucune compétence de l'offre", () => {
    const result = scoreLetterDocument("Je suis motivé et rigoureux.", job());

    expect(result.score).toBe(0);
    expect(result.matchedSkills).toEqual([]);
  });

  it("rend un score nul, jamais inventé, quand l'offre ne nomme rien de lisible", () => {
    const result = scoreLetterDocument(
      "Je suis disponible immédiatement.",
      job({ title: "Poste polyvalent", requirements: [], responsibilities: [], description: "" }),
    );

    expect(result.score).toBe(0);
    expect(result.offerSkills).toEqual([]);
  });
});
