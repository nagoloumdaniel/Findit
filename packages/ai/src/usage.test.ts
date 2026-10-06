import { describe, expect, it } from "vitest";

import { computeCostMicroUsd } from "./usage.js";

describe("computeCostMicroUsd", () => {
  it("applique un tarif en dollars par million de tokens", () => {
    // 1 000 000 tokens d'entrée à 0,50 $/M = 0,50 $ = 500 000 micro-dollars.
    expect(
      computeCostMicroUsd(
        { inputTokens: 1_000_000, outputTokens: 0, calls: 1 },
        { inputUsdPerMillionTokens: 0.5, outputUsdPerMillionTokens: 1.5 },
      ),
    ).toBe(500_000);
  });

  it("additionne entrée et sortie, arrondies au micro-dollar", () => {
    expect(
      computeCostMicroUsd(
        { inputTokens: 1200, outputTokens: 340, calls: 1 },
        { inputUsdPerMillionTokens: 0.5, outputUsdPerMillionTokens: 2 },
      ),
    ).toBe(Math.round(1200 * 0.5 + 340 * 2));
  });

  it("rend zéro pour un tarif nul, sans jamais rendre un coût négatif", () => {
    expect(
      computeCostMicroUsd(
        { inputTokens: 10_000, outputTokens: 10_000, calls: 3 },
        { inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 },
      ),
    ).toBe(0);
  });
});
