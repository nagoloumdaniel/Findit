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

  /*
   * Mesuré le 2026-10-07 : cinq offres d'écoles (ISCOD, IRIS, EEMI) étaient
   * publiées parce que leur annonce ressemble à celle d'un employeur — le
   * détecteur de texte concluait « aucun signal d'école ». Le nom tranche.
   */
  it("écarte un employeur reconnu comme école, même avec une annonce d'employeur", () => {
    const decision = detectSchoolRisk(
      input({
        companyName: "ISCOD",
        title: "Alternance Développeur Front-End - Herblay",
        description: "Rejoignez notre équipe et développez des interfaces en React.",
      }),
    );

    expect(decision).toMatchObject({ kind: "SCHOOL", excluded: true, riskScore: 100 });
    expect(decision.reasons[0]).toContain("liste citée");
  });

  it("écarte sur une seule formulation qu'un employeur n'écrit jamais", () => {
    // « entreprises partenaires » pesait 35 points, sous le seuil de quarantaine
    // de 40 : l'offre passait en employeur.
    const decision = detectSchoolRisk(
      input({
        companyName: "Acme",
        description: "Nous vous accompagnons vers nos entreprises partenaires.",
      }),
    );

    expect(decision).toMatchObject({ kind: "TRAINING_ORGANISATION", excluded: true });
    expect(decision.reasons[0]).toContain("entreprises partenaires");
  });

  it("laisse un employeur ordinaire qui ne promet ni frais ni placement", () => {
    const decision = detectSchoolRisk(
      input({
        companyName: "Safran",
        title: "Stage - Développeur logiciel embarqué",
        description: "Vous rejoindrez l'équipe logicielle du site de Massy.",
      }),
    );

    expect(decision).toMatchObject({ kind: "EMPLOYER", excluded: false });
  });

  it("ne rejette pas un institut de recherche qui recrute", () => {
    // Recherche faite en base le 2026-10-07 : sur 861 entreprises, « Institut
    // Pasteur » est le seul nom évocateur avec une école — et ce n'en est pas
    // une. « institut » vaut 60 (quarantaine), jamais l'exclusion.
    const decision = detectSchoolRisk(
      input({
        companyName: "Institut Pasteur",
        title: "Stage - Développeur bioinformatique",
        description: "Vous rejoindrez l'unité de bioinformatique.",
      }),
    );

    expect(decision.excluded).toBe(false);
    expect(decision.riskScore).toBeGreaterThanOrEqual(60);
  });
});
