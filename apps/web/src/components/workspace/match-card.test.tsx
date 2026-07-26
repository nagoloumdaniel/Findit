import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LetterView, MatchView } from "../../lib/workspace-api";
import { LetterCard } from "./letter-card";
import { MatchCard } from "./match-card";

const match: MatchView = {
  job: { slug: "offre-test", title: "Alternance Front-end", companyName: "Orbit Studio" },
  score: 93,
  scoreBreakdown: [
    {
      criterion: "required_skills",
      weight: 58.8,
      rawScore: 1,
      points: 58.8,
      details: ["2 des 2 compétences exigées sont couvertes."],
    },
  ],
  matchedSkills: ["TypeScript", "React"],
  missingSkills: ["Java"],
  missingKeywords: ["PostgreSQL"],
  strengths: [],
  weaknesses: [],
  recommendations: ["Remonter « Docker » dans la section compétences."],
  confidence: 70,
  insufficientDataWarning: null,
  computedAt: "2026-07-26T10:00:00.000Z",
};

const letter: LetterView = {
  job: { slug: "offre-test", title: "Alternance Front-end", companyName: "Orbit Studio" },
  subject: "Candidature à l'alternance Front-end",
  paragraphs: ["Premier paragraphe factuel.", "Second paragraphe factuel."],
  usedFacts: ["BTS SIO", "stage WebAgence"],
  warnings: ["Niveau d'anglais non précisé."],
  generatedAt: "2026-07-26T10:00:00.000Z",
};

describe("MatchCard", () => {
  it("shows the score with its reasons, never alone", () => {
    const html = renderToStaticMarkup(<MatchCard match={match} />);

    expect(html).toContain("93/100");
    expect(html).toContain("confiance 70/100");
    expect(html).toContain("Compétences exigées");
    expect(html).toContain("TypeScript");
    expect(html).toContain("Java");
    expect(html).toContain("PostgreSQL");
    expect(html).toContain("Docker");
  });

  it("shows the insufficient-data warning as-is", () => {
    const html = renderToStaticMarkup(
      <MatchCard match={{ ...match, insufficientDataWarning: "Pas assez de matière." }} />,
    );
    expect(html).toContain("Pas assez de matière.");
  });
});

describe("LetterCard", () => {
  it("shows the whole letter for review, with used facts and warnings", () => {
    const html = renderToStaticMarkup(<LetterCard letter={letter} />);

    expect(html).toContain("Objet : Candidature");
    expect(html).toContain("Premier paragraphe factuel.");
    expect(html).toContain("BTS SIO");
    expect(html).toContain("Niveau d&#x27;anglais non précisé.");
    expect(html).toContain("Relire avant usage");
  });
});
