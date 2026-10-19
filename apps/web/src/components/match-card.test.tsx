import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RankedItem } from "../lib/matching-api";
import { MatchCard } from "./match-card";

const now = new Date("2026-07-17T12:00:00.000Z");

const item = (overrides: Partial<RankedItem> = {}): RankedItem => ({
  jobSlug: "alternance-front-end-paris",
  jobTitle: "Alternance Développeur Front-end",
  companyName: "Orbit Studio",
  city: "Paris",
  contractType: "ALTERNANCE",
  publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
  score: 78,
  matchedSkills: ["React", "TypeScript"],
  missingSkills: [],
  confidence: 82,
  insufficientDataWarning: null,
  ...overrides,
});

describe("MatchCard", () => {
  it("affiche le pourcentage quand l'analyse est fiable", () => {
    const html = renderToStaticMarkup(<MatchCard item={item()} now={now} />);

    expect(html).toContain("78%");
    expect(html).toContain("de correspondance");
    expect(html).toContain("React");
    expect(html).toContain('href="/offres/alternance-front-end-paris"');
  });

  it("n'affiche pas de pourcentage inventé quand l'analyse est trop fragile", () => {
    const html = renderToStaticMarkup(
      <MatchCard
        item={item({ score: 0, insufficientDataWarning: "profil trop incomplet" })}
        now={now}
      />,
    );

    expect(html).toContain("Correspondance non fiable");
    expect(html).not.toContain("%");
    expect(html).not.toMatch(/class="match-score-value"/);
  });

  it("reste une carte lisible, avec le lien vers le détail", () => {
    const html = renderToStaticMarkup(<MatchCard item={item()} now={now} />);

    expect(html).toContain("Orbit Studio");
    expect(html).toContain("Paris");
    expect(html).toContain("Alternance");
  });
});
