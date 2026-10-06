import { describe, expect, it } from "vitest";

import { decideDuplicate } from "./decide.js";
import type { ComparableOffer } from "./similarity.js";
import { scoreSimilarity } from "./similarity.js";

const offer = (company: string, over: Partial<ComparableOffer> = {}): ComparableOffer => ({
  normalizedTitle: "alternance developpeur back end node js",
  normalizedCompany: company,
  departmentCode: "75",
  city: "Paris",
  publishedAt: new Date("2026-10-06T08:00:00.000Z"),
  descriptionText: "Développer des API Node.js. Profil recherché : TypeScript.",
  ...over,
});

const company = (a: string, b: string): number =>
  scoreSimilarity(offer(a), offer(b)).breakdown.company;

describe("company similarity", () => {
  it("ignores legal forms: the same company with or without SAS is the same", () => {
    expect(company("acme", "acme sas")).toBe(1);
    expect(company("acme sarl", "acme sasu")).toBe(1);
    expect(company("acme gmbh", "acme")).toBe(1);
  });

  it("treats a longer name that contains the shorter as a variant, but not as identical", () => {
    const score = company("acme", "acme france");

    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it("does not let a shared suffix or prefix make two companies alike (bug B010)", () => {
    // Même titre, même date, même description : seul le nom d'entreprise les sépare.
    for (const [a, b] of [
      ["preuve307 alpha sas", "preuve307 gamma sas"],
      ["groupe acme", "groupe beta"],
      ["acme labs", "acme studio"],
      ["banque de france", "banque populaire"],
    ] as const) {
      expect(decideDuplicate(offer(a), offer(b)).action, `${a} / ${b}`).toBe("DISTINCT");
    }
  });

  it("still merges the same publication across spellings of the company", () => {
    for (const [a, b] of [
      ["acme", "acme sas"],
      ["acme", "groupe acme"],
      ["orange", "orange france"],
    ] as const) {
      expect(decideDuplicate(offer(a), offer(b)).action, `${a} / ${b}`).toBe("MERGE");
    }
  });

  it("falls back to the whole name when it is only legal forms", () => {
    expect(company("sas", "sas")).toBe(1);
    expect(company("sas", "sarl")).toBe(0);
  });
});
