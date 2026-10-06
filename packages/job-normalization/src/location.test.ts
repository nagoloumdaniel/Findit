import { describe, expect, it } from "vitest";

import { resolveLocation } from "./location.js";

describe("resolveLocation", () => {
  it("places the label real French boards actually write", () => {
    // Relevé 50 fois sur boards-api.greenhouse.io/v1/boards/doctolib.
    expect(resolveLocation("Paris, Paris, France")).toEqual({
      inScope: true,
      city: "Paris",
      departmentCode: "75",
      workMode: null,
      evidence: "Paris, Paris, France",
    });
  });

  it("places a bare city, because that is how Lever writes it", () => {
    expect(resolveLocation("Boulogne-Billancourt")).toMatchObject({
      inScope: true,
      city: "Boulogne-Billancourt",
      departmentCode: "92",
    });
  });

  it("reads a commune followed by its department number", () => {
    // Formes relevées sur les offres : « Montrouge - 92 », « Vélizy-Villacoublay - 78 ».
    expect(resolveLocation("Montrouge - 92")).toMatchObject({
      inScope: true,
      city: "Montrouge",
      departmentCode: "92",
    });
    expect(resolveLocation("Vélizy-Villacoublay - 78")).toMatchObject({
      inScope: true,
      city: "Vélizy-Villacoublay",
      departmentCode: "78",
    });
  });

  it("reads a commune however the source spells it", () => {
    for (const label of [
      "Boulogne-Billancourt",
      "boulogne billancourt",
      "BOULOGNE BILLANCOURT",
      "Boulogne‑Billancourt".replace("‑", "-"),
    ]) {
      expect(resolveLocation(label)).toMatchObject({ departmentCode: "92" });
    }
  });

  it("knows the eight departments apart", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["Paris", "75"],
      ["Melun", "77"],
      ["Versailles", "78"],
      ["Évry-Courcouronnes", "91"],
      ["Nanterre", "92"],
      ["Saint-Denis", "93"],
      ["Créteil", "94"],
      ["Cergy", "95"],
    ];

    for (const [city, department] of cases) {
      expect(resolveLocation(city)).toMatchObject({ inScope: true, departmentCode: department });
    }
  });

  it("takes the work mode the label carries in front of the city", () => {
    // Formes relevées : « Hybrid - London », « Remote - United States ».
    expect(resolveLocation("Hybrid - Paris")).toMatchObject({
      inScope: true,
      city: "Paris",
      workMode: "HYBRID",
    });
    expect(resolveLocation("Télétravail - Montrouge")).toMatchObject({
      workMode: "REMOTE",
      departmentCode: "92",
    });
  });

  it("keeps the work mode even when the place is out of scope", () => {
    expect(resolveLocation("Remote - United States")).toMatchObject({
      inScope: false,
      reason: "OUTSIDE_ILE_DE_FRANCE",
      workMode: "REMOTE",
    });
  });

  it("accepts a posting open in two places when one of them is in scope", () => {
    // Relevé chez Doctolib, tel quel.
    expect(resolveLocation("Berlin, Berlin, Germany; Paris, Paris, France")).toMatchObject({
      inScope: true,
      city: "Paris",
      departmentCode: "75",
    });
  });

  it("refuses the foreign cities the same boards are full of", () => {
    for (const label of [
      "Berlin, Berlin, Germany",
      "London",
      "New York, NY",
      "Milano, Milan, Italy",
      "München",
      "Hybrid - San Francisco, New York City, Austin",
    ]) {
      expect(resolveLocation(label)).toMatchObject({
        inScope: false,
        reason: "OUTSIDE_ILE_DE_FRANCE",
      });
    }
  });

  it("refuses a French city outside the zone", () => {
    for (const label of ["Nantes", "Orléans", "Strasbourg", "Biarritz", "Lyon"]) {
      expect(resolveLocation(label)).toMatchObject({
        inScope: false,
        reason: "OUTSIDE_ILE_DE_FRANCE",
      });
    }
  });

  it("does not take a commune's name for a place when the country says otherwise", () => {
    // Une commune d'Île-de-France s'appelle « Milly-la-Forêt » ; une ville
    // allemande ne devient pas francilienne parce qu'un mot coïncide.
    expect(resolveLocation("Paris, Texas, United States")).toMatchObject({
      inScope: false,
      reason: "OUTSIDE_ILE_DE_FRANCE",
    });
  });

  it("refuses to guess a department when France is all the label says", () => {
    for (const label of ["France", "Île-de-France", "Remote - France"]) {
      expect(resolveLocation(label)).toMatchObject({ inScope: false, reason: "TOO_VAGUE" });
    }
  });

  it("refuses to pick between two communes that share a name", () => {
    // Blandy existe en Essonne et en Seine-et-Marne. Le libellé ne dit pas
    // laquelle, et trancher inventerait le département.
    const resolution = resolveLocation("Blandy");

    expect(resolution).toMatchObject({ inScope: false, reason: "AMBIGUOUS_COMMUNE" });
    expect(resolution.inScope).toBe(false);
    if (!resolution.inScope) {
      expect(resolution.detail).toContain("deux communes");
    }
  });

  it("says the location is missing rather than pretending it is elsewhere", () => {
    for (const label of [null, "", "   "]) {
      expect(resolveLocation(label)).toMatchObject({ inScope: false, reason: "NO_LOCATION" });
    }
  });

  it("lit un code postal d'Île-de-France collé à la commune", () => {
    // Relevé sur un vrai run : « 92000 Nanterre, France » était refusé comme
    // trop vague, alors que 92 est un département du périmètre.
    expect(resolveLocation("92000 Nanterre, France")).toMatchObject({
      inScope: true,
      city: "Nanterre",
      departmentCode: "92",
    });
    expect(resolveLocation("75001 Paris")).toMatchObject({
      inScope: true,
      city: "Paris",
      departmentCode: "75",
    });
  });

  it("lit le code postal qu'il précède ou qu'il suive la commune", () => {
    expect(resolveLocation("Nanterre 92000")).toMatchObject({
      inScope: true,
      city: "Nanterre",
      departmentCode: "92",
    });
  });

  it("prend un code postal hors zone pour une preuve, pas pour un flou", () => {
    // « France » seul serait TOO_VAGUE ; le code postal, lui, dit où.
    expect(resolveLocation("69000 Lyon, France")).toMatchObject({
      inScope: false,
      reason: "OUTSIDE_ILE_DE_FRANCE",
    });
    expect(resolveLocation("69000 Lyon")).toMatchObject({
      inScope: false,
      reason: "OUTSIDE_ILE_DE_FRANCE",
    });
  });

  it("situe le département sur un code postal seul, sans inventer de commune", () => {
    expect(resolveLocation("92000")).toMatchObject({
      inScope: true,
      city: "92000",
      departmentCode: "92",
    });
  });
});
