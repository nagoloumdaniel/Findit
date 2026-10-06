import { describe, expect, it } from "vitest";

import { DEFAULT_SCORE_THRESHOLD, scoreSources } from "./scoring.js";
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
});
