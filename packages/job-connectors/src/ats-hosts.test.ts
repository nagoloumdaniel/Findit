import { describe, expect, it } from "vitest";

import { canonicalAtsHost } from "./ats-hosts.js";

describe("canonicalAtsHost", () => {
  it("ramène les deux hôtes Greenhouse à un seul", () => {
    // Mesuré en base : `doctolib` portait deux CompanySource, une par hôte, donc
    // deux collectes de la même entreprise.
    expect(canonicalAtsHost("greenhouse", "job-boards.greenhouse.io")).toBe("boards.greenhouse.io");
    expect(canonicalAtsHost("greenhouse", "boards.greenhouse.io")).toBe("boards.greenhouse.io");
  });

  it("laisse les autres connecteurs sur l'hôte où ils ont été trouvés", () => {
    expect(canonicalAtsHost("lever", "jobs.lever.co")).toBe("jobs.lever.co");
    expect(canonicalAtsHost("workday", "acme.myworkdayjobs.com")).toBe("acme.myworkdayjobs.com");
  });
});
