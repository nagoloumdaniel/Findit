import { describe, expect, it } from "vitest";

import { canonicalAtsHost } from "./ats-hosts.js";

describe("canonicalAtsHost", () => {
  it("laisse l'hôte historique de Greenhouse sur lui-même", () => {
    expect(canonicalAtsHost("greenhouse", "boards.greenhouse.io")).toBe("boards.greenhouse.io");
  });

  it("ramène la variante job-boards à l'hôte canonique", () => {
    // Mesuré en base : `doctolib` portait deux CompanySource, une par hôte, donc
    // deux collectes de la même entreprise. Variante relevée aussi dans le code
    // (`discovery.ATS_HOSTS`) et dans les runs réels.
    expect(canonicalAtsHost("greenhouse", "job-boards.greenhouse.io")).toBe("boards.greenhouse.io");
  });

  it("laisse tel quel un hôte Greenhouse hors des variantes relevées", () => {
    /*
     * Décision explicite : ni `boards.eu.greenhouse.io` ni `<entreprise>.greenhouse.io`
     * n'apparaissent dans le code ou dans `CompanySource` (relevé le 2026-10-07).
     * Les réécrire au canonique reviendrait à fusionner des boards sans preuve
     * qu'ils sont le même ; un doublon se voit en base et se répare, une fusion
     * mal fondée ne se défait pas. Ces hôtes restent donc rendus tels quels, et
     * devront être ajoutés ici explicitement le jour où ils seront observés.
     */
    expect(canonicalAtsHost("greenhouse", "boards.eu.greenhouse.io")).toBe(
      "boards.eu.greenhouse.io",
    );
    expect(canonicalAtsHost("greenhouse", "acme.greenhouse.io")).toBe("acme.greenhouse.io");
  });

  it("laisse les autres connecteurs sur l'hôte où ils ont été trouvés", () => {
    expect(canonicalAtsHost("lever", "jobs.lever.co")).toBe("jobs.lever.co");
    expect(canonicalAtsHost("workday", "acme.myworkdayjobs.com")).toBe("acme.myworkdayjobs.com");
  });
});
