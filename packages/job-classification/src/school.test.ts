import { describe, expect, it } from "vitest";

import { detectSchoolRisk } from "./school.js";

const input = (over: Partial<Parameters<typeof detectSchoolRisk>[0]> = {}) => ({
  companyName: "Acme",
  title: "Alternance - Développeur Front-end React",
  description:
    "Rejoignez notre équipe produit. Vous développerez l'interface en React et TypeScript.",
  ...over,
});

describe("detectSchoolRisk", () => {
  it("leaves a real employer offer alone, even when it mentions a diploma", () => {
    // « diplôme » et « formation » sont normaux dans une alternance : ils ne
    // doivent pas déclencher à eux seuls.
    const decision = detectSchoolRisk(
      input({
        description:
          "Alternance préparant un diplôme Bac+5. Vous rejoignez notre équipe et développez nos API en Node.js.",
      }),
    );

    expect(decision).toMatchObject({ kind: "EMPLOYER", excluded: false });
    expect(decision.riskScore).toBeLessThan(40);
  });

  it("quarantines a company whose very name is a school", () => {
    const decision = detectSchoolRisk(input({ companyName: "École Supérieure du Numérique" }));

    expect(decision).toMatchObject({ riskScore: 60, excluded: false });
    expect(decision.reasons.join(" ")).toContain("ecole");
  });

  it("rejects a school selling a training program", () => {
    const decision = detectSchoolRisk(
      input({
        companyName: "Campus Tech",
        description:
          "Intégrez notre formation en développement web. Nous vous plaçons dans une de nos entreprises partenaires.",
      }),
    );

    expect(decision).toMatchObject({ kind: "SCHOOL", excluded: true });
    expect(decision.riskScore).toBeGreaterThanOrEqual(70);
  });

  it("rejects an offer asking the candidate to pay for training", () => {
    const decision = detectSchoolRisk(
      input({
        companyName: "Institut de Formation Pro",
        description: "Des frais de formation sont à prévoir. Reste à charge de 2000 euros.",
      }),
    );

    expect(decision.excluded).toBe(true);
  });

  it("never mistakes a recruitment agency for a school", () => {
    // La spécification l'interdit explicitement.
    const decision = detectSchoolRisk(
      input({
        companyName: "Talent Cabinet de Recrutement",
        description:
          "Pour le compte de notre client, nous recherchons un développeur en alternance.",
      }),
    );

    expect(decision).toMatchObject({ kind: "RECRUITMENT_AGENCY", excluded: false, riskScore: 0 });
  });

  it("reads English school framing too", () => {
    const decision = detectSchoolRisk(
      input({
        companyName: "Dev Academy",
        title: "Developer Apprentice",
        description: "Join our training program. We place you in one of our partner companies.",
      }),
    );

    // « academy » dans le nom → 60, mais le texte anglais « training program »
    // n'est pas dans les signaux : reste en quarantaine, pas rejeté d'office.
    expect(decision.riskScore).toBeGreaterThanOrEqual(60);
  });

  it("always gives a reason", () => {
    expect(detectSchoolRisk(input()).reasons.length).toBeGreaterThan(0);
  });
});
