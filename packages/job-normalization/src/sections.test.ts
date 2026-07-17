import { describe, expect, it } from "vitest";

import { htmlToBlocks } from "./html-text.js";
import { extractSections } from "./sections.js";

const sectionsOf = (html: string) => extractSections(htmlToBlocks(html));

describe("extractSections", () => {
  it("files the bullets under the heading that announced them", () => {
    const sections = sectionsOf(
      "<h2>What You'll Do</h2><ul><li>Ship features</li><li>Review code</li></ul>" +
        "<h2>Who You Are</h2><ul><li>You know React</li></ul>" +
        "<h2>Benefits:</h2><ul><li>Remote budget</li></ul>",
    );

    expect(sections).toEqual({
      responsibilities: ["Ship features", "Review code"],
      requirements: ["You know React"],
      benefits: ["Remote budget"],
    });
  });

  it("reads the French headings the target zone is written in", () => {
    const sections = sectionsOf(
      "<h3>Vos missions</h3><ul><li>Développer l'interface</li></ul>" +
        "<h3>Profil recherché</h3><ul><li>Vous maîtrisez TypeScript</li></ul>" +
        "<h3>Nos avantages</h3><ul><li>Tickets restaurant</li></ul>",
    );

    expect(sections).toEqual({
      responsibilities: ["Développer l'interface"],
      requirements: ["Vous maîtrisez TypeScript"],
      benefits: ["Tickets restaurant"],
    });
  });

  it("accepts a bold paragraph as a heading when a list follows it", () => {
    // Forme réelle : 189 sections de Doctolib sont écrites ainsi.
    const sections = sectionsOf(
      "<p><strong>Vos missions</strong></p><ul><li>Coder</li><li>Tester</li></ul>",
    );

    expect(sections.responsibilities).toEqual(["Coder", "Tester"]);
  });

  it("does not take a bold paragraph for a heading when nothing follows it", () => {
    const sections = sectionsOf(
      "<h2>Vos missions</h2><ul><li>Coder</li></ul><p><strong>Merci de postuler tôt.</strong></p>",
    );

    expect(sections.responsibilities).toEqual(["Coder"]);
  });

  it("does not take an emphasised word inside a sentence for a heading", () => {
    const sections = sectionsOf(
      "<h2>Vos missions</h2><ul><li>Coder</li></ul>" +
        "<p>Nous cherchons un <strong>expert</strong> confirmé.</p><ul><li>Encore une mission</li></ul>",
    );

    expect(sections.responsibilities).toEqual(["Coder", "Encore une mission"]);
  });

  it("closes a section when an unrelated heading opens", () => {
    const sections = sectionsOf(
      "<h2>Vos missions</h2><ul><li>Coder</li></ul>" +
        "<h2>À propos de Doctolib</h2><ul><li>Nous sommes 3000</li></ul>",
    );

    expect(sections.responsibilities).toEqual(["Coder"]);
    expect(sections.requirements).toEqual([]);
    expect(sections.benefits).toEqual([]);
  });

  it("does not mistake a company blurb for a section about the candidate", () => {
    // « About Vercel: » et « About You: » se ressemblent et ne disent pas la
    // même chose. Le premier est relevé 73 fois sur les offres réelles.
    const sections = sectionsOf("<h2>About Vercel:</h2><ul><li>We build the web</li></ul>");

    expect(sections.requirements).toEqual([]);
  });

  it("ignores bullets that no heading introduced", () => {
    expect(sectionsOf("<ul><li>Une puce orpheline</li></ul>")).toEqual({
      responsibilities: [],
      requirements: [],
      benefits: [],
    });
  });

  it("leaves a prose section empty rather than cutting sentences into a list", () => {
    const sections = sectionsOf(
      "<h2>Vos missions</h2><p>Vous développerez l'interface. Vous relirez le code.</p>",
    );

    expect(sections.responsibilities).toEqual([]);
  });

  it("keeps a heading's bullets together when the source splits the list", () => {
    const sections = sectionsOf(
      "<h2>Who You Are</h2><ul><li>React</li></ul><p>Et aussi :</p><ul><li>TypeScript</li></ul>",
    );

    expect(sections.requirements).toEqual(["React", "TypeScript"]);
  });

  it("reads a real Greenhouse posting, bold headings included", () => {
    // Forme relevée sur boards-api.greenhouse.io, après décodage.
    const sections = sectionsOf(
      '<div class="content-intro"><h2>About Vercel:</h2><p>Vercel gives developers the tools.</p></div>' +
        "<p><strong>What You Will Do:</strong></p><ul><li>Own the pipeline</li></ul>" +
        "<h2>About You:</h2><ul><li>5 years of experience</li></ul>" +
        "<h2>Benefits:</h2><ul><li>Stock options</li></ul>",
    );

    expect(sections).toEqual({
      responsibilities: ["Own the pipeline"],
      requirements: ["5 years of experience"],
      benefits: ["Stock options"],
    });
  });
});
