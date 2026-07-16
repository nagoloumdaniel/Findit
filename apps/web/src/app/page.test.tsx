import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("states the real initialization status and validated scope", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain('<main class="page-shell">');
    expect(html).toContain("Findit");
    expect(html).toContain("Initialisation technique");
    expect(html).toContain("Alternances et stages");
    expect(html).toContain("Développement logiciel");
    expect(html).toContain("Développement mobile");
    expect(html).toContain("Data Analyst");
    expect(html).toContain("Data Engineer");
    expect(html).toContain("24 heures");
    expect(html).toContain("72 heures");
    expect(html).toContain("Aucune offre n’est affichée");
    expect(html).not.toContain("offres disponibles");
    expect(html).not.toMatch(/\d+\s+offres/iu);
  });
});
