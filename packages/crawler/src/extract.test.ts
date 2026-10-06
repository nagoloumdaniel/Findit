import { describe, expect, it } from "vitest";

import {
  extractLinks,
  extractText,
  findPaginationLinks,
  isListingPage,
  shouldRenderWithBrowser,
} from "./extract.js";
import type { HttpPage } from "./http.js";

const page = (html: string, status = 200): HttpPage => ({
  url: "https://example.com/",
  status,
  html,
});

describe("extractText", () => {
  it("rend le texte visible sans le code ni le style", () => {
    const html = `
      <html><head><title>ignoré</title><style>.x{}</style></head>
      <body>
        <h1>Offre</h1>
        <p>Développeur <strong>Full Stack</strong>.</p>
        <script>window.x = 1;</script>
      </body></html>`;

    expect(extractText(html)).toBe("Offre Développeur Full Stack.");
  });
});

describe("extractLinks", () => {
  it("résout les liens relatifs, dédoublonne et ignore les non-liens", () => {
    const html = `
      <a href="/offres/1">un</a>
      <a href="offres/2">deux</a>
      <a href="/offres/1">déjà vu</a>
      <a href="mailto:x@example.com">courriel</a>
      <a href="javascript:void(0)">rien</a>`;

    expect(extractLinks(html, "https://example.com/liste/")).toEqual([
      "https://example.com/offres/1",
      "https://example.com/liste/offres/2",
    ]);
  });
});

describe("findPaginationLinks", () => {
  it("préfère rel=next explicite", () => {
    const html = `<a href="/?page=2" rel="next">La suite</a>`;
    expect(findPaginationLinks(html, "https://example.com/")).toEqual([
      "https://example.com/?page=2",
    ]);
  });

  it("reconnaît le texte qui annonce la suite", () => {
    const html = `<a href="/?page=2">Suivant</a>`;
    expect(findPaginationLinks(html, "https://example.com/")).toEqual([
      "https://example.com/?page=2",
    ]);
  });

  it("reconnaît un paramètre de page qui avance d'un cran", () => {
    const html = `<a href="/offres?page=3">3</a><a href="/offres?page=99">99</a>`;
    expect(findPaginationLinks(html, "https://example.com/offres?page=2")).toEqual([
      "https://example.com/offres?page=3",
    ]);
  });

  it("rend une liste vide quand rien n'annonce la suite", () => {
    expect(findPaginationLinks(`<a href="/a">a</a>`, "https://example.com/")).toEqual([]);
  });
});

describe("isListingPage", () => {
  it("reconnaît une page qui énumère beaucoup de chemins distincts", () => {
    const links = Array.from({ length: 6 }, (_unused, index) => `<a href="/o/${index}">o</a>`).join(
      "",
    );
    expect(isListingPage(links, "https://example.com/")).toBe(true);
  });

  it("ne voit pas de listing dans une page aux rares liens", () => {
    expect(isListingPage(`<a href="/a">a</a>`, "https://example.com/")).toBe(false);
  });
});

describe("shouldRenderWithBrowser", () => {
  it("ne rend jamais une page en erreur", () => {
    expect(shouldRenderWithBrowser(page("<script>x</script>", 404))).toBe(false);
  });

  it("ne rend pas une page déjà servie avec du texte", () => {
    expect(shouldRenderWithBrowser(page(`<p>${"x".repeat(80)}</p>`))).toBe(false);
  });

  it("rend une page vide qui embarque des scripts", () => {
    expect(
      shouldRenderWithBrowser(page(`<div id="app"></div><script src="app.js"></script>`)),
    ).toBe(true);
  });
});
