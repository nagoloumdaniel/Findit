import { describe, expect, it } from "vitest";

import { classifyJob } from "./classify.js";

/*
 * Les titres cités ici sont réels, relevés sur les boards Lever de Qonto,
 * BlaBlaCar, Malt et Spotify, et sur les boards Greenhouse de Doctolib et
 * Vercel, le 2026-07-17.
 */
describe("classifyJob", () => {
  it("accepts a developer alternance and cites what decided", () => {
    const decision = classifyJob({
      title: "Alternance - Développeur Front-end React (F/H)",
      commitmentLabel: "FR Apprentice",
    });

    expect(decision).toMatchObject({
      outcome: "ACCEPTED",
      contractType: "ALTERNANCE",
      roleCategory: "FRONTEND",
      confidence: 90,
    });
    expect(decision.reasons.join(" ")).toContain("les deux disent ALTERNANCE");
  });

  it("trusts two agreeing voices more than one", () => {
    const both = classifyJob({
      title: "Alternance Développeur Back-end",
      commitmentLabel: "Apprenticeship",
    });
    const titleOnly = classifyJob({ title: "Alternance Développeur Back-end" });

    expect(both.confidence).toBe(90);
    expect(titleOnly.confidence).toBe(80);
  });

  it("lets the weakest link set the confidence", () => {
    // Le contrat est certain — titre et source concordent — mais le métier
    // n'est pas nommé. Une certitude sur l'un ne rachète pas le doute sur
    // l'autre.
    expect(
      classifyJob({ title: "Alternance Développeur", commitmentLabel: "Apprenticeship" }),
    ).toMatchObject({ confidence: 70, roleCategory: "OTHER_DEVELOPER" });
  });

  it("reads the contract from the source's label when the title stays silent", () => {
    const decision = classifyJob({
      title: "Backend Developer",
      commitmentLabel: "Apprenticeship",
    });

    expect(decision).toMatchObject({ outcome: "ACCEPTED", contractType: "ALTERNANCE" });
    expect(decision.reasons.join(" ")).toContain("Le titre ne dit pas le contrat");
  });

  it("rejects the permanent roles that fill these boards", () => {
    for (const title of [
      "Senior/Staff - Backend Engineer - remote friendly",
      "Senior Product Engineer - iOS/Swift",
      "Account Executive, Majors",
    ]) {
      expect(classifyJob({ title, commitmentLabel: "Permanent" })).toMatchObject({
        outcome: "REJECTED",
        contractType: null,
      });
    }
  });

  it("rejects a real alternance that is not a developer job", () => {
    // Les dix alternances réelles relevées sont dans ce cas : aucune n'est un
    // poste de développement.
    for (const title of [
      "Comptable - Alternance",
      "Events & Customer Loyalty Apprentice",
      "Business & Marketing Apprentice",
      "Alternance - Talent Acquisition Specialist",
      "Stage - Juriste E-Santé (x/f/m) - Janvier 2027",
      "Alternance - Chargé de recrutement - Tech & Product (x/f/m)",
    ]) {
      const decision = classifyJob({ title, commitmentLabel: "FR Apprentice" });

      expect(decision).toMatchObject({ outcome: "REJECTED", roleCategory: null });
      expect(decision.contractType).not.toBeNull();
      expect(decision.reasons.join(" ")).toContain("ne nomme aucun métier du périmètre");
    }
  });

  it("does not read « Internal » as an internship", () => {
    // Titre réel : « Internal Control Apprentice (Tech & Product) ». Chercher
    // « intern » sans borne de mot en ferait un stage.
    expect(classifyJob({ title: "Internal Control Apprentice (Tech & Product)" })).toMatchObject({
      contractType: "ALTERNANCE",
    });
  });

  it("does not take an analyst for a data analyst", () => {
    // Titre réel : « Carpool Pricing Analyst Apprentice 1 year ».
    expect(classifyJob({ title: "Carpool Pricing Analyst Apprentice 1 year" })).toMatchObject({
      outcome: "REJECTED",
      roleCategory: null,
    });
  });

  it("quarantines a posting whose two voices disagree", () => {
    const decision = classifyJob({
      title: "Alternance Développeur Back-end",
      commitmentLabel: "Permanent",
    });

    expect(decision).toMatchObject({
      outcome: "QUARANTINED",
      contractType: "ALTERNANCE",
      roleCategory: "BACKEND",
      confidence: 40,
    });
    expect(decision.reasons.join(" ")).toContain("hors périmètre");
  });

  it("keeps the specific role over the broad one", () => {
    expect(classifyJob({ title: "Software Engineer iOS - Alternance" })).toMatchObject({
      roleCategory: "MOBILE",
    });
    expect(classifyJob({ title: "Alternance Développeur Full-stack" })).toMatchObject({
      roleCategory: "FULLSTACK",
    });
  });

  it("files a developer with no named speciality rather than inventing one", () => {
    const decision = classifyJob({ title: "Alternance Développeur Web" });

    expect(decision).toMatchObject({ roleCategory: "OTHER_DEVELOPER", confidence: 70 });
    expect(decision.reasons.join(" ")).toContain("sans dire quelle spécialité");
  });

  it("still stores data and mobile, which the flux merely does not show", () => {
    expect(classifyJob({ title: "Alternance Data Engineer" })).toMatchObject({
      outcome: "ACCEPTED",
      roleCategory: "DATA_ENGINEER",
    });
    expect(classifyJob({ title: "Alternance Développeur Mobile Android" })).toMatchObject({
      outcome: "ACCEPTED",
      roleCategory: "MOBILE",
    });
  });

  it("reads a technology whose name is made of regex metacharacters", () => {
    // « c++ » et « c# » ont failli être cherchés par expression régulière, où
    // « + » est un quantificateur. Le texte normalisé étant borné par des
    // espaces, la recherche est une inclusion — il n'y a plus rien à échapper.
    expect(classifyJob({ title: "Alternance Développeur C# .NET" })).toMatchObject({
      outcome: "ACCEPTED",
      roleCategory: "BACKEND",
    });
  });

  it("does not let a token match inside a longer word", () => {
    // « net » ne doit pas se trouver dans « network », ni « java » dans
    // « javascript » au point d'en changer le sens du titre.
    expect(classifyJob({ title: "Alternance Network Administrator" })).toMatchObject({
      outcome: "REJECTED",
      roleCategory: null,
    });
  });

  it("never decides without saying why", () => {
    for (const title of [
      "Alternance Développeur React",
      "Sales Manager",
      "Comptable - Alternance",
    ]) {
      expect(classifyJob({ title }).reasons.length).toBeGreaterThan(0);
    }
  });
});
