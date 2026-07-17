import { describe, expect, it } from "vitest";

import { decideDuplicate, findBestMatch } from "./decide.js";
import type { ComparableOffer } from "./similarity.js";

const offer = (over: Partial<ComparableOffer> = {}): ComparableOffer => ({
  normalizedTitle: "developpeur front end react",
  normalizedCompany: "acme",
  departmentCode: "75",
  city: "Paris",
  publishedAt: new Date("2026-07-17T09:00:00.000Z"),
  descriptionText: "Développer l'interface en React et TypeScript au sein de l'équipe produit.",
  ...over,
});

describe("decideDuplicate", () => {
  it("merges the same offer seen on two sources, worded differently", () => {
    const a = offer();
    const b = offer({
      publishedAt: new Date("2026-07-17T11:00:00.000Z"),
      descriptionText: "Rejoignez-nous pour construire une interface React moderne en TypeScript.",
    });

    const decision = decideDuplicate(a, b);

    expect(decision.action).toBe("MERGE");
    expect(decision.similarity.score).toBeGreaterThanOrEqual(0.85);
    expect(decision.similarity.reasons).toContain("Même entreprise.");
  });

  it("keeps two different companies apart even with the same title", () => {
    const decision = decideDuplicate(
      offer(),
      offer({
        normalizedCompany: "globex",
        descriptionText: "Un poste distinct chez une autre entreprise, contenu sans rapport.",
      }),
    );

    expect(decision.action).toBe("DISTINCT");
  });

  it("never merges across departments, whatever the rest says", () => {
    // Même entreprise, même titre, même date — mais deux départements : une
    // publication d'Île-de-France n'a qu'un lieu.
    const decision = decideDuplicate(offer(), offer({ departmentCode: "92", city: "Nanterre" }));

    expect(decision.action).toBe("DISTINCT");
    expect(decision.similarity.breakdown.location).toBe(0);
  });

  it("leaves a genuinely ambiguous pair to review rather than guess", () => {
    // Même entreprise et même lieu, mais titres seulement proches.
    const decision = decideDuplicate(
      offer(),
      offer({
        normalizedTitle: "developpeur react",
        descriptionText: "Un tout autre poste, back-end, sans rapport de contenu.",
        publishedAt: new Date("2026-07-14T09:00:00.000Z"),
      }),
    );

    expect(decision.action).toBe("REVIEW");
  });

  it("carries a per-criterion breakdown for the record", () => {
    const decision = decideDuplicate(offer(), offer());

    expect(decision.similarity.breakdown).toMatchObject({
      company: 1,
      title: 1,
      location: 1,
      date: 1,
    });
  });
});

describe("findBestMatch", () => {
  it("finds the closest existing offer, or says there is none", () => {
    const candidate = offer();
    const existing = [
      offer({ normalizedCompany: "globex" }), // distinct
      offer({ descriptionText: "React TypeScript interface produit équipe." }), // merge
    ];

    const found = findBestMatch(candidate, existing);

    expect(found?.decision.action).toBe("MERGE");
    expect(found?.match.normalizedCompany).toBe("acme");
  });

  it("returns nothing when every existing offer is distinct", () => {
    const found = findBestMatch(offer(), [offer({ normalizedCompany: "globex" })]);

    expect(found).toBeNull();
  });

  it("prefers the highest score when several could match", () => {
    const candidate = offer();
    const existing = [
      offer({ publishedAt: new Date("2026-07-15T09:00:00.000Z") }), // slightly older
      offer(), // exact
    ];

    const found = findBestMatch(candidate, existing);

    expect(found?.decision.similarity.score).toBe(
      Math.max(...existing.map((e) => decideDuplicate(candidate, e).similarity.score)),
    );
  });
});
