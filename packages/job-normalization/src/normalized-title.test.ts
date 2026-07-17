import { describe, expect, it } from "vitest";

import { normalizeTitle } from "./normalized-title.js";

describe("normalizeTitle", () => {
  it("brings the same job published two ways to the same form", () => {
    expect(normalizeTitle("Alternance — Développeur Front-end React H/F")).toBe(
      normalizeTitle("Développeur Front-End React (Alternance) F/H"),
    );
    expect(normalizeTitle("Alternance — Développeur Front-end React H/F")).toBe(
      "developpeur front end react",
    );
  });

  it("strips the accents that one publication writes and another does not", () => {
    expect(normalizeTitle("Développeur Données")).toBe("developpeur donnees");
  });

  it("drops gender mentions in the forms the sources actually use", () => {
    for (const title of [
      "Data Analyst H/F",
      "Data Analyst (F/H)",
      "Data Analyst m/w/d",
      "Data Analyst M/F/X",
    ]) {
      expect(normalizeTitle(title)).toBe("data analyst");
    }
  });

  it("drops the contract, which is a field of its own", () => {
    for (const title of [
      "Stage Développeur Mobile iOS",
      "Développeur Mobile iOS — Stage",
      "Développeur Mobile iOS en apprentissage",
      "Développeur Mobile iOS internship",
    ]) {
      expect(normalizeTitle(title)).toBe("developpeur mobile ios");
    }
  });

  it("drops the code that identifies the posting, not the job", () => {
    expect(normalizeTitle("Data Engineer — REF: 4821")).toBe("data engineer");
    expect(normalizeTitle("Data Engineer (REQ-4821)")).toBe("data engineer");
    expect(normalizeTitle("Data Engineer #5156316004")).toBe("data engineer");
  });

  it("keeps the characters that carry meaning in a technology's name", () => {
    expect(normalizeTitle("Développeur C++ / C# H/F")).toBe("developpeur c++ c#");
  });

  it("does not mistake a word that merely starts like a contract", () => {
    expect(normalizeTitle("Internal Tools Engineer")).toBe("internal tools engineer");
    expect(normalizeTitle("Alternative Data Analyst")).toBe("alternative data analyst");
  });

  it("keeps a number that belongs to the job", () => {
    expect(normalizeTitle("Développeur Web3")).toBe("developpeur web3");
  });

  it("leaves nothing rather than inventing a title that was never written", () => {
    expect(normalizeTitle("Stage H/F")).toBe("");
  });

  it("reads a real title from each source", () => {
    expect(
      normalizeTitle("Advertiser Solutions Vendor Lead - Programmatic and Direct Support"),
    ).toBe("advertiser solutions vendor lead programmatic and direct support");
    expect(normalizeTitle("Account Executive, Majors")).toBe("account executive majors");
  });
});
