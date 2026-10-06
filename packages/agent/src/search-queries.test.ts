import { describe, expect, it } from "vitest";

import { generateSearchQueries } from "./search-queries.js";

describe("generateSearchQueries", () => {
  it("rend une liste vide pour un objectif vide", () => {
    expect(generateSearchQueries("   ")).toEqual([]);
  });

  it("est déterministe : deux appels donnent le même résultat", () => {
    const objective = "Offres d'alternance fullstack à Paris";
    expect(generateSearchQueries(objective)).toEqual(generateSearchQueries(objective));
  });

  it("reprend l'objectif tel quel comme première requête", () => {
    const queries = generateSearchQueries("Alternance développeur React");
    expect(queries[0]?.query).toBe("Alternance développeur React");
  });

  it("ajoute les deux contrats quand l'objectif n'en précise aucun", () => {
    const all = generateSearchQueries("développeur web à Lyon").map((q) => q.query);
    expect(all).toContain("développeur web à Lyon alternance");
    expect(all).toContain("développeur web à Lyon stage");
  });

  it("produit une variante par technologie détectée", () => {
    const all = generateSearchQueries("alternance développeur React Node").map((q) => q.query);
    expect(all.some((q) => q.includes("react alternance"))).toBe(true);
    expect(all.some((q) => q.includes("node alternance"))).toBe(true);
  });

  it("produit une variante de localisation", () => {
    const all = generateSearchQueries("alternance à Paris").map((q) => q.query);
    expect(all).toContain("alternance paris");
  });

  it("produit des variantes site: sur les domaines de confiance", () => {
    const all = generateSearchQueries("alternance fullstack").map((q) => q.query);
    expect(all.some((q) => q.includes("site:boards.greenhouse.io"))).toBe(true);
    expect(all.some((q) => q.includes("site:jobs.lever.co"))).toBe(true);
  });

  it("produit une variante par rôle : le métier cible les pages du périmètre", () => {
    const all = generateSearchQueries("alternance et stage développeur en Île-de-France").map(
      (q) => q.query,
    );
    expect(all.some((q) => q.startsWith("offre développeur alternance"))).toBe(true);
    expect(all.some((q) => q.includes("développeur stage"))).toBe(true);
  });

  it("vise un métier du périmètre quand l'objectif n'en nomme aucun", () => {
    const all = generateSearchQueries("alternance à Paris").map((q) => q.query);
    expect(all.some((q) => q.includes("développeur"))).toBe(true);
  });

  it("ne duplique jamais deux requêtes identiques", () => {
    const all = generateSearchQueries("alternance stage à Paris").map((q) => q.query.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it("utilise le moteur brave par défaut", () => {
    const queries = generateSearchQueries("alternance dev");
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(query.engine).toBe("brave");
    }
  });
});
