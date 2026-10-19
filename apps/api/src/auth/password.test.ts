import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("hache un mot de passe sans jamais le conserver en clair", () => {
    const hash = hashPassword("mot-de-passe-long");
    expect(hash).not.toContain("mot-de-passe-long");
    expect(hash.split(":").length).toBe(2);
  });

  it("vérifie le bon mot de passe et refuse le mauvais", () => {
    const hash = hashPassword("mot-de-passe-long");
    expect(verifyPassword("mot-de-passe-long", hash)).toBe(true);
    expect(verifyPassword("autre-mot-de-passe", hash)).toBe(false);
  });

  it("refuse une forme stockée illisible", () => {
    expect(verifyPassword("x", "sans-separateur")).toBe(false);
  });
});
