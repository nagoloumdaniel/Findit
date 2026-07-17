import { describe, expect, it } from "vitest";

import { jobSlug, slugify } from "./slug.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("strips accents and lowercases, matching the API's slug pattern", () => {
    expect(slugify("Développeur Full-Stack")).toBe("developpeur-full-stack");
    expect(slugify("Développeur Full-Stack")).toMatch(SLUG_PATTERN);
  });

  it("collapses punctuation and trims stray hyphens", () => {
    expect(slugify("  React / Node.js — (H/F) ")).toBe("react-node-js-h-f");
  });

  it("cuts at a hyphen rather than mid-word when too long", () => {
    const slug = slugify("un titre volontairement tres long qui depasse la limite fixee", 20);

    expect(slug.length).toBeLessThanOrEqual(20);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it("returns nothing slugifiable as empty, leaving the fallback to the caller", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("jobSlug", () => {
  it("keeps two same-titled offers apart by their source id", () => {
    const a = jobSlug("developpeur front end react", "Paris", "111");
    const b = jobSlug("developpeur front end react", "Paris", "222");

    expect(a).not.toBe(b);
    expect(a).toMatch(SLUG_PATTERN);
  });

  it("is stable for the same offer, so a re-collection finds its slug", () => {
    expect(jobSlug("developpeur back end", "Courbevoie", "abc-42")).toBe(
      jobSlug("developpeur back end", "Courbevoie", "abc-42"),
    );
  });

  it("survives an empty normalized title by leaning on the id", () => {
    const slug = jobSlug("", "Paris", "5999792004");

    expect(slug).toMatch(SLUG_PATTERN);
    expect(slug).toContain("5999792004");
  });
});
