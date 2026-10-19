import { describe, expect, it } from "vitest";

import { computeMatch, type JobMatchInput, type ResumeMatchInput } from "./score.js";

const resume = (over: Partial<ResumeMatchInput> = {}): ResumeMatchInput => ({
  sectionSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
  evidenceSkills: ["Git"],
  titles: ["Développeur web junior", "Développeur front-end React"],
  languages: [{ name: "Français" }, { name: "Anglais", level: "B2" }],
  ...over,
});

const job = (over: Partial<JobMatchInput> = {}): JobMatchInput => ({
  title: "Alternance Développeur Front-End H/F",
  normalizedTitle: "developpeur front end",
  roleCategory: "FRONTEND",
  requirements: [
    "Maîtrise de TypeScript et React.",
    "Connaissance de Git.",
    "Anglais professionnel apprécié.",
  ],
  responsibilities: ["Développer des interfaces avec Next.js et Tailwind."],
  description: "Équipe produit web. Stack : React, Node.js, PostgreSQL.",
  ...over,
});

describe("computeMatch", () => {
  it("scores a well-aligned resume high, with every point explained", () => {
    const result = computeMatch(resume(), job());

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.insufficientDataWarning).toBeNull();
    expect(result.matchedSkills).toContain("TypeScript");
    expect(result.matchedSkills).toContain("React");
    expect(result.strengths.join(" ")).toContain("TypeScript");

    // Chaque critère actif est pondéré et le total des poids refait 100.
    const totalWeight = result.breakdown.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 0);
    const criteria = result.breakdown.map((c) => c.criterion);
    expect(criteria).toContain("required_skills");
    expect(criteria).toContain("languages");
  });

  it("lists a required skill that the resume does not have", () => {
    const result = computeMatch(
      resume({ sectionSkills: ["TypeScript", "React", "Node.js"], evidenceSkills: [] }),
      job({ requirements: ["Java et Spring exigés.", "TypeScript apprécié."] }),
    );

    expect(result.missingSkills).toContain("Java");
    expect(result.missingSkills).toContain("Spring");
    expect(result.weaknesses.join(" ")).toContain("Java");
    expect(result.score).toBeLessThan(70);
  });

  it("does not confuse java with javascript", () => {
    const result = computeMatch(
      resume({ sectionSkills: ["JavaScript"], evidenceSkills: [] }),
      job({ requirements: ["Java exigé."], description: "", responsibilities: [] }),
    );

    expect(result.missingSkills).toContain("Java");
    expect(result.matchedSkills).not.toContain("Java");
  });

  it("excludes the title criterion when the resume has no titles, and renormalizes", () => {
    const result = computeMatch(resume({ titles: [] }), job());

    const criteria = result.breakdown.map((c) => c.criterion);
    expect(criteria).not.toContain("title_alignment");
    const totalWeight = result.breakdown.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 0);
  });

  it("excludes the languages criterion when the job never mentions one", () => {
    const result = computeMatch(
      resume(),
      job({
        requirements: ["TypeScript et React."],
        description: "Stack web moderne.",
        responsibilities: [],
        title: "Alternance Développeur Front-End",
      }),
    );

    expect(result.breakdown.map((c) => c.criterion)).not.toContain("languages");
  });

  it("flags a missing required language as a weakness", () => {
    const result = computeMatch(
      resume({ languages: [{ name: "Français" }] }),
      job({ requirements: ["TypeScript.", "Anglais courant exigé."] }),
    );

    expect(result.weaknesses.join(" ")).toContain("anglais");
  });

  it("warns instead of inventing when there is not enough data", () => {
    const result = computeMatch(
      resume({ sectionSkills: [], evidenceSkills: [], titles: [], languages: [] }),
      job({
        title: "Alternance",
        normalizedTitle: "",
        requirements: ["Motivation."],
        responsibilities: [],
        description: "Poste polyvalent.",
      }),
    );

    expect(result.insufficientDataWarning).not.toBeNull();
    expect(result.confidence).toBeLessThanOrEqual(30);
    expect(result.score).toBe(0);
  });

  it("recommends surfacing a skill proven in experience but absent from the skills section", () => {
    const result = computeMatch(
      resume({ sectionSkills: ["TypeScript"], evidenceSkills: ["Docker"] }),
      job({ requirements: ["TypeScript et Docker exigés."] }),
    );

    expect(result.recommendations.join(" ")).toContain("Docker");
    // Une compétence déjà en section ne génère pas de recommandation.
    expect(result.recommendations.join(" ")).not.toContain("TypeScript");
  });

  it("is deterministic: the same pair always yields the same score", () => {
    const first = computeMatch(resume(), job());
    const second = computeMatch(resume(), job());
    expect(second).toEqual(first);
  });
});
