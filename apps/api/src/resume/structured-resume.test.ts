import { describe, expect, it } from "vitest";

import { sanitizeDatesAgainstSource } from "./structured-resume.js";
import type { ResumeFacts } from "./structured-resume.js";

const emptyFacts: ResumeFacts = {
  identity: {},
  education: [],
  experiences: [],
  projects: [],
  skills: [],
  languages: [],
  certifications: [],
  links: [],
};

describe("sanitizeDatesAgainstSource", () => {
  it("garde une date que la source écrit telle quelle", () => {
    const facts: ResumeFacts = {
      ...emptyFacts,
      experiences: [
        {
          title: "Dev",
          company: "Acme",
          startDate: "2025",
          endDate: "2026",
          achievements: [],
          skills: [],
        },
      ],
    };

    const result = sanitizeDatesAgainstSource(facts, "Développeur chez Acme de 2025 à 2026");

    expect(result.facts.experiences[0]?.startDate).toBe("2025");
    expect(result.facts.experiences[0]?.endDate).toBe("2026");
    expect(result.warnings).toEqual([]);
  });

  it("ramène une précision inventée à l'année que la source écrit", () => {
    const facts: ResumeFacts = {
      ...emptyFacts,
      experiences: [{ title: "Dev", startDate: "2025-01-01", achievements: [], skills: [] }],
    };

    const result = sanitizeDatesAgainstSource(facts, "Développeur depuis 2025");

    expect(result.facts.experiences[0]?.startDate).toBe("2025");
    expect(result.warnings.length).toBe(1);
  });

  it("retire une date totalement absente de la source", () => {
    const facts: ResumeFacts = {
      ...emptyFacts,
      certifications: [{ name: "Certification", date: "2019" }],
    };

    const result = sanitizeDatesAgainstSource(facts, "Certification obtenue");

    expect(result.facts.certifications[0]?.date).toBeUndefined();
    expect(result.warnings.length).toBe(1);
  });
});
