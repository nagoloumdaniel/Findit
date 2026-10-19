import { describe, expect, it } from "vitest";

import { containsAlias, normalizeText, tokenize } from "./normalize.js";
import { canonicalizeSkill, detectSkillsInText } from "./tech-dictionary.js";

describe("normalizeText", () => {
  it("drops case and accents but keeps technical characters", () => {
    expect(normalizeText("Développeur C++ / C# - Node.js")).toBe("developpeur c++ / c# - node.js");
  });
});

describe("tokenize", () => {
  it("splits on anything that is not a technical word character", () => {
    expect(tokenize("Développeur Front-End (React/Node.js)")).toEqual([
      "developpeur",
      "front",
      "end",
      "react",
      "node.js",
    ]);
  });
});

describe("containsAlias", () => {
  it("matches whole technical words only", () => {
    expect(containsAlias("maitrise de java demandee", "java")).toBe(true);
    expect(containsAlias("maitrise de javascript demandee", "java")).toBe(false);
    expect(containsAlias("connaissance de c++ appreciee", "c++")).toBe(true);
    expect(containsAlias("developpement .net en equipe", ".net")).toBe(true);
    expect(containsAlias("stack asp.net classique", ".net")).toBe(false);
  });
});

describe("canonicalizeSkill", () => {
  it("maps spelling variants to one canonical entry", () => {
    expect(canonicalizeSkill("Node.JS")?.id).toBe("nodejs");
    expect(canonicalizeSkill("NodeJS")?.id).toBe("nodejs");
    expect(canonicalizeSkill("postgres")?.id).toBe("postgresql");
    expect(canonicalizeSkill("PostgreSQL")?.id).toBe("postgresql");
  });

  it("refuses whole sentences instead of guessing", () => {
    expect(canonicalizeSkill("bonne connaissance de react")).toBeNull();
  });
});

describe("detectSkillsInText", () => {
  it("finds dictionary entries written as-is in a job text", () => {
    const found = detectSkillsInText(
      "Vous maîtrisez React et TypeScript, idéalement Docker et PostgreSQL.",
    ).map((entry) => entry.id);

    expect(found).toContain("react");
    expect(found).toContain("typescript");
    expect(found).toContain("docker");
    expect(found).toContain("postgresql");
  });

  it("does not read an ambiguous French word as a technology", () => {
    // « vue » au sens courant ne doit pas devenir Vue.js.
    const found = detectSkillsInText("Une vue d'ensemble du projet est attendue.").map(
      (entry) => entry.id,
    );
    expect(found).not.toContain("vue");
  });
});
