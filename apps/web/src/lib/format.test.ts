import { describe, expect, it } from "vitest";

import { formatCount, formatUsd } from "./format.js";

describe("formatUsd", () => {
  it("garde quatre décimales, parce qu'un run coûte des centimes", () => {
    // 5 444 micro-dollars = 0,005444 $ : deux décimales afficheraient 0,01 $,
    // et zéro décimales afficheraient 0 $.
    expect(formatUsd(5444)).toContain("0,0054");
  });

  it("écrit la décimale à la française", () => {
    expect(formatUsd(1_500_000)).toContain("1,5");
    expect(formatUsd(1_500_000)).not.toContain("1.5");
  });

  it("rend zéro sans inventer de dépense", () => {
    expect(formatUsd(0)).toContain("0,0000");
  });
});

describe("formatCount", () => {
  it("sépare les milliers à la française", () => {
    // Espace insécable étroite ou espace simple selon la plateforme.
    expect(formatCount(12_856).replace(/\u202f|\u00a0/gu, " ")).toBe("12 856");
  });
});
