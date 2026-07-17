import { describe, expect, it } from "vitest";

import { htmlToBlocks, htmlToText } from "./html-text.js";

describe("htmlToBlocks", () => {
  it("keeps the nature the markup gave each block", () => {
    const blocks = htmlToBlocks(
      "<h2>About the role</h2><p>Vous rejoignez l'équipe.</p><ul><li>React</li><li>TypeScript</li></ul>",
    );

    expect(blocks).toEqual([
      { kind: "heading", text: "About the role", level: 2 },
      { kind: "paragraph", text: "Vous rejoignez l'équipe." },
      { kind: "listItem", text: "React" },
      { kind: "listItem", text: "TypeScript" },
    ]);
  });

  it("reads a heading's level from its tag rather than guessing", () => {
    const blocks = htmlToBlocks("<h1>A</h1><h3>B</h3><h6>C</h6>");

    expect(blocks.map((block) => block.level)).toEqual([1, 3, 6]);
  });

  it("drops the code that markup carries but a reader never sees", () => {
    const blocks = htmlToBlocks(
      "<style>.a{color:red}</style><p>Le poste</p><script>alert('x')</script>",
    );

    expect(blocks).toEqual([{ kind: "paragraph", text: "Le poste" }]);
  });

  it("separates text that only a <br> held apart", () => {
    expect(htmlToBlocks("<p>Paris<br>Hybride</p>")).toEqual([
      { kind: "paragraph", text: "Paris" },
      { kind: "paragraph", text: "Hybride" },
    ]);
  });

  it("does not let a nested block swallow the text around it", () => {
    expect(htmlToBlocks("<div>Avant<div>Dedans</div>Après</div>")).toEqual([
      { kind: "paragraph", text: "Avant" },
      { kind: "paragraph", text: "Dedans" },
      { kind: "paragraph", text: "Après" },
    ]);
  });

  it("keeps inline markup from breaking a sentence apart", () => {
    expect(htmlToBlocks("<p>Vous <strong>maîtrisez</strong> <em>React</em>.</p>")).toEqual([
      { kind: "paragraph", text: "Vous maîtrisez React." },
    ]);
  });

  it("collapses the non-breaking spaces the sources are full of", () => {
    expect(htmlToBlocks("<p>Île de France&nbsp;— 3 jours</p>")).toEqual([
      { kind: "paragraph", text: "Île de France — 3 jours" },
    ]);
  });

  it("keeps nothing where there was nothing", () => {
    expect(htmlToBlocks("<p></p><div>   </div><ul><li></li></ul>")).toEqual([]);
    expect(htmlToBlocks("")).toEqual([]);
  });

  it("reads markup a regular expression would trip on", () => {
    // Balises non fermées et imbrication invalide : le HTML des offres est écrit
    // à la main, et c'est exactement ce qu'on reçoit.
    const blocks = htmlToBlocks("<div><p>Un<p>Deux<ul><li>Trois<li>Quatre</ul></div>");

    expect(blocks.map((block) => block.text)).toEqual(["Un", "Deux", "Trois", "Quatre"]);
  });

  it("decodes entities instead of showing them raw", () => {
    expect(htmlToBlocks("<p>R&amp;D chez Acme &lt;3</p>")).toEqual([
      { kind: "paragraph", text: "R&D chez Acme <3" },
    ]);
  });
});

describe("htmlToText", () => {
  it("detaches a heading from the text around it", () => {
    expect(htmlToText("<p>Intro</p><h2>Missions</h2><ul><li>Coder</li><li>Tester</li></ul>")).toBe(
      "Intro\n\nMissions\n\nCoder\nTester",
    );
  });

  it("renders a real Greenhouse description once decoded", () => {
    // Forme relevée sur boards-api.greenhouse.io, après décodage par le
    // connecteur : Greenhouse rend ce HTML entièrement échappé.
    const html =
      '<div class="content-intro"><h2>About Vercel:</h2>\n<p>Vercel gives developers the tools.</p></div><p><strong>What You Will Do:</strong></p><ul><li>Build things</li></ul>';

    expect(htmlToText(html)).toBe(
      "About Vercel:\n\nVercel gives developers the tools.\nWhat You Will Do:\nBuild things",
    );
  });

  it("records that a paragraph was all bold without promoting it to a heading", () => {
    // Cas fréquent : l'employeur écrit ses intertitres en « <p><strong> »
    // plutôt qu'en « <h2> ». Le gras est un fait du balisage et il est noté ;
    // en déduire un titre ici inventerait une structure que le balisage ne
    // porte pas. C'est `extractSections` qui décide de ce que ce gras signifie.
    expect(htmlToBlocks("<p><strong>Missions</strong></p>")).toEqual([
      { kind: "paragraph", text: "Missions", emphasised: true },
    ]);
  });

  it("does not call a paragraph bold when only a word inside it is", () => {
    expect(htmlToBlocks("<p>Nous cherchons un <strong>expert</strong> confirmé.</p>")).toEqual([
      { kind: "paragraph", text: "Nous cherchons un expert confirmé." },
    ]);
  });

  it("sees through the whitespace the source's indentation leaves between tags", () => {
    expect(htmlToBlocks("<p>\n  <strong>Missions</strong>\n</p>")).toEqual([
      { kind: "paragraph", text: "Missions", emphasised: true },
    ]);
  });

  it("renders a real Lever description, lists included", () => {
    // Forme relevée sur api.lever.co, telle que le connecteur la recolle.
    const html =
      "<div>\n<p>Support what you love.</p></div>\n<h3>What You'll Do</h3><ul>\n<li>Work with vendor management</li></ul>\n<div>Spotify is an equal opportunity employer.</div>";

    expect(htmlToText(html)).toBe(
      "Support what you love.\n\nWhat You'll Do\n\nWork with vendor management\nSpotify is an equal opportunity employer.",
    );
  });
});
