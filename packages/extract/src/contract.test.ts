import type { CrawledPage } from "@findit/crawler";
import { describe, expect, it } from "vitest";

import { mentionsPerimeterContract } from "./contract.js";

const page = (over: Partial<CrawledPage> = {}): CrawledPage => ({
  url: "https://example.com/offres",
  depth: 0,
  html: "<html><body>...</body></html>",
  text: "",
  status: 200,
  robotsDenied: false,
  ...over,
});

describe("mentionsPerimeterContract", () => {
  it("reconnaît les contrats du périmètre dans le texte visible", () => {
    expect(mentionsPerimeterContract(page({ text: "Offre en alternance à Paris" }))).toBe(true);
    expect(mentionsPerimeterContract(page({ text: "Contrat d'apprentissage" }))).toBe(true);
    expect(mentionsPerimeterContract(page({ text: "Stage de fin d'études" }))).toBe(true);
    expect(mentionsPerimeterContract(page({ text: "Nous cherchons un stagiaire" }))).toBe(true);
    expect(mentionsPerimeterContract(page({ text: "Six month internship" }))).toBe(true);
  });

  it("ignore la casse et les accents", () => {
    expect(mentionsPerimeterContract(page({ text: "ALTERNANCE" }))).toBe(true);
    expect(mentionsPerimeterContract(page({ text: "Alternant développeur" }))).toBe(true);
  });

  it("écarte une page qui ne nomme aucun contrat du périmètre", () => {
    expect(
      mentionsPerimeterContract(
        page({
          text: "Senior Backend Engineer — CDI — Analytics Engineer Mexico",
        }),
      ),
    ).toBe(false);
  });

  it("retombe sur le HTML quand il n'y a pas de texte visible", () => {
    expect(
      mentionsPerimeterContract(
        page({ text: "", html: '<script type="application/ld+json">"INTERNSHIP"</script>' }),
      ),
    ).toBe(true);
    expect(
      mentionsPerimeterContract(page({ text: "", html: "<html><body>CDI</body></html>" })),
    ).toBe(false);
  });

  it("ne se laisse pas tromper par un mot proche sans contrat", () => {
    // « stage » n'apparaît pas ; « backstage » n'est pas un contrat.
    expect(mentionsPerimeterContract(page({ text: "Backend developer, CDI" }))).toBe(false);
  });
});
