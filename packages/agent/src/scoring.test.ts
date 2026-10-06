import { describe, expect, it } from "vitest";

import { DEFAULT_SCORE_THRESHOLD, isAtsBoardListing, scoreSources } from "./scoring.js";
import type { SourceResult } from "./types.js";

const result = (overrides: Partial<SourceResult> = {}): SourceResult => ({
  domain: "example.com",
  url: "https://example.com/jobs",
  title: "",
  description: "",
  ...overrides,
});

describe("scoreSources", () => {
  it("renvoie un score borné entre 0 et 100", () => {
    const [scored] = scoreSources([result({})]);
    expect(scored?.score).toBeGreaterThanOrEqual(0);
    expect(scored?.score).toBeLessThanOrEqual(100);
  });

  it("écarte une source sans signal sous le seuil par défaut", () => {
    const [scored] = scoreSources([
      result({
        domain: "exemple-sans-signal.fr",
        url: "https://exemple-sans-signal.fr",
        title: "Bienvenue",
        description: "Un site quelconque",
      }),
    ]);
    expect(scored?.score).toBeLessThan(DEFAULT_SCORE_THRESHOLD);
    expect(scored?.keep).toBe(false);
  });

  it("valorise un ATS reconnu au-dessus du seuil", () => {
    const [scored] = scoreSources([
      result({
        domain: "boards.greenhouse.io",
        url: "https://boards.greenhouse.io/acme",
        title: "Acme - Jobs",
        description: "Nos offres d'alternance et de stage",
      }),
    ]);
    expect(scored?.score).toBeGreaterThanOrEqual(DEFAULT_SCORE_THRESHOLD);
    expect(scored?.keep).toBe(true);
    expect(scored?.reasons).toContain("domaine d'ATS reconnu");
  });

  it("fait remonter une page qui parle de développement", () => {
    const scored = scoreSources([
      result({
        domain: "generique.fr",
        url: "https://generique.fr/annonces",
        title: "Annonces",
        description: "Toutes les offres",
      }),
      result({
        domain: "dev.fr",
        url: "https://dev.fr/offres",
        title: "Offres développeur",
        description: "Alternance développeur web",
      }),
    ]);

    const dev = scored.find((source) => source.result.domain === "dev.fr");
    const generic = scored.find((source) => source.result.domain === "generique.fr");
    expect(dev?.reasons).toContain("vocabulaire de développement détecté");
    expect(dev?.score).toBeGreaterThan(generic?.score ?? 100);
  });

  it("pénalise un organisme de formation et l'écarte", () => {
    const [scored] = scoreSources([
      result({
        domain: "openclassrooms.com",
        url: "https://openclassrooms.com/formations",
        title: "Formation développeur web",
        description: "Formation en alternance",
      }),
    ]);
    expect(scored?.score).toBeLessThan(DEFAULT_SCORE_THRESHOLD);
    expect(scored?.keep).toBe(false);
    expect(scored?.reasons).toContain("organisme de formation ou école probable");
  });

  it("détecte un flux ou une API", () => {
    const [scored] = scoreSources([
      result({
        url: "https://example.com/api/jobs.json",
        title: "Offres d'emploi",
        description: "Liste des offres",
      }),
    ]);
    expect(scored?.reasons).toContain("flux ou fichier structuré détecté");
  });

  it("respecte un seuil configurable", () => {
    const [scored] = scoreSources(
      [
        result({
          domain: "boards.greenhouse.io",
          url: "https://boards.greenhouse.io/acme",
          title: "Jobs",
        }),
      ],
      { threshold: 100 },
    );
    expect(scored?.keep).toBe(false);
  });

  it("trie du meilleur au moins bon score", () => {
    const scored = scoreSources([
      result({
        domain: "site-sans-signal.fr",
        url: "https://site-sans-signal.fr",
        title: "Bienvenue",
      }),
      result({
        domain: "boards.greenhouse.io",
        url: "https://boards.greenhouse.io/acme",
        title: "Jobs",
        description: "alternance",
      }),
    ]);
    expect(scored[0]?.score).toBeGreaterThanOrEqual(scored[1]?.score ?? 0);
  });

  it("fait passer une page d'offre à la source avant la racine du board", () => {
    const scored = scoreSources([
      result({
        domain: "boards.greenhouse.io",
        url: "https://boards.greenhouse.io/acme",
        title: "Acme - Jobs",
        description: "Nos offres d'alternance",
      }),
      result({
        domain: "boards.greenhouse.io",
        url: "https://boards.greenhouse.io/acme/jobs/4606134004",
        title: "Développeur full stack",
        description: "Alternance",
      }),
    ]);

    expect(scored[0]?.result.url).toContain("/jobs/");
    expect(scored[0]?.reasons).toContain("page d'offre individuelle probable");
    expect(scored[1]?.reasons).not.toContain("page d'offre individuelle probable");
  });

  it("rétrograde une page de recherche d'agrégateur sans l'écarter", () => {
    const scored = scoreSources([
      result({
        domain: "fr.indeed.com",
        url: "https://fr.indeed.com/q-stage-developpeur-emplois.html",
        title: "Stage développeur",
        description: "Des offres d'emploi",
      }),
      result({
        domain: "jobs.lever.co",
        url: "https://jobs.lever.co/theodo/19acaa5d-159c-4ca9-a39c-f5a2ed5ffcd5",
        title: "Développeur",
        description: "Alternance",
      }),
    ]);

    const aggregator = scored.find((source) => source.result.domain === "fr.indeed.com");
    expect(aggregator?.reasons).toContain("page de recherche agrégée probable");
    expect(aggregator?.keep).toBe(true);
    expect(scored[0]?.result.domain).toBe("jobs.lever.co");
  });
});

describe("isAtsBoardListing", () => {
  it("reconnaît la racine d'un board, pas ses pages d'offre", () => {
    // Une racine liste tous les contrats d'une entreprise : on la traverse,
    // on ne la prend pas pour une offre.
    expect(isAtsBoardListing("https://boards.greenhouse.io/acme")).toBe(true);
    expect(isAtsBoardListing("https://jobs.lever.co/theodo")).toBe(true);

    expect(isAtsBoardListing("https://boards.greenhouse.io/acme/jobs/4606134004")).toBe(false);
    expect(
      isAtsBoardListing("https://jobs.lever.co/theodo/19acaa5d-159c-4ca9-a39c-f5a2ed5ffcd5"),
    ).toBe(false);
  });

  it("ne prend pas un site ordinaire pour un board d'ATS", () => {
    expect(isAtsBoardListing("https://example.com/jobs")).toBe(false);
    expect(isAtsBoardListing("pas une url")).toBe(false);
  });
});
