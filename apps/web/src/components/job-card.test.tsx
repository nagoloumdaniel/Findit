import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { JobListItem } from "../lib/api";
import { JobCard } from "./job-card";

const now = new Date("2026-07-17T12:00:00.000Z");

const job = (overrides: Partial<JobListItem> = {}): JobListItem => ({
  slug: "alternance-front-end-paris",
  isDemo: false,
  title: "Alternance Développeur Front-end",
  roleCategory: "FRONTEND",
  companyName: "Orbit Studio",
  companyLogoUrl: null,
  city: "Paris",
  departmentCode: "75",
  contractType: "ALTERNANCE",
  workMode: "HYBRID",
  publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
  dataQualityScore: 92,
  skills: ["React", "TypeScript"],
  canonicalSource: { name: "Page carrière Orbit Studio", url: "https://example.invalid/job" },
  ...overrides,
});

describe("JobCard", () => {
  it("shows the facts the offer actually carries", () => {
    const html = renderToStaticMarkup(<JobCard job={job()} now={now} />);

    expect(html).toContain("Alternance Développeur Front-end");
    expect(html).toContain("Orbit Studio");
    expect(html).toContain("Paris");
    expect(html).toContain("75");
    expect(html).toContain("Front-end");
    expect(html).toContain("Alternance");
    expect(html).toContain("Hybride");
    expect(html).toContain("il y a 2 h");
    expect(html).toContain("Source très fiable");
    expect(html).toContain("React");
    expect(html).toContain("TypeScript");
  });

  it("names the department it is actually in", () => {
    const html = renderToStaticMarkup(
      <JobCard job={job({ departmentCode: "93", city: "Montreuil" })} now={now} />,
    );

    expect(html).toContain("Montreuil");
    expect(html).toContain("Seine-Saint-Denis");
  });

  it("links to the internal detail page, never to an apply action", () => {
    const html = renderToStaticMarkup(<JobCard job={job()} now={now} />);

    expect(html).toContain('href="/offres/alternance-front-end-paris"');
    expect(html).not.toMatch(/postuler/iu);
  });

  it("flags a demonstration offer so it cannot pass for a real one", () => {
    const html = renderToStaticMarkup(<JobCard job={job({ isDemo: true })} now={now} />);

    expect(html).toContain("Démonstration");
    expect(html).toContain("n’existe chez aucun employeur");
  });

  it("carries no demonstration flag on a real offer", () => {
    const html = renderToStaticMarkup(<JobCard job={job({ isDemo: false })} now={now} />);

    expect(html).not.toContain("Démonstration");
  });

  it("says the source is missing rather than inventing one", () => {
    const html = renderToStaticMarkup(<JobCard job={job({ canonicalSource: null })} now={now} />);

    expect(html).toContain("Source non renseignée");
  });
});
