import { describe, expect, it } from "vitest";

import { decideIngestion } from "./ingest.js";
import type { CollectedOffer } from "./ingest.js";

const NOW = new Date("2026-07-17T12:00:00.000Z");

const offer = (over: Partial<CollectedOffer> = {}): CollectedOffer => ({
  sourceJobId: "42",
  url: "https://boards.greenhouse.io/acme/jobs/42",
  title: "Alternance - Développeur Front-end React (F/H)",
  locationLabel: "Paris, Île-de-France, France",
  descriptionHtml:
    "<h2>Vos missions</h2><ul><li>Coder</li></ul><h2>Profil recherché</h2><ul><li>React</li></ul>",
  publishedAt: new Date("2026-07-17T09:00:00.000Z"),
  companyName: "Acme",
  commitmentLabel: null,
  sourceName: "greenhouse",
  ...over,
});

describe("decideIngestion", () => {
  it("carries the apply link the source gave, and defaults to none", () => {
    const withLink = decideIngestion(offer({ applyUrl: "https://jobs.acme.test/apply/42" }), NOW);
    const without = decideIngestion(offer(), NOW);

    if (withLink.outcome === "REJECTED" || without.outcome === "REJECTED") {
      throw new Error("attendu accepté");
    }
    expect(withLink.draft.applyUrl).toBe("https://jobs.acme.test/apply/42");
    expect(without.draft.applyUrl).toBeNull();
  });

  it("accepts a fresh developer alternance in scope, and assembles it", () => {
    const decision = decideIngestion(offer(), NOW);

    expect(decision.outcome).toBe("ACCEPTED");
    if (decision.outcome === "REJECTED") throw new Error("attendu accepté");
    expect(decision.draft).toMatchObject({
      roleCategory: "FRONTEND",
      contractType: "ALTERNANCE",
      city: "Paris",
      departmentCode: "75",
      normalizedTitle: "developpeur front end react",
      status: "PUBLISHED",
      externalId: "42",
      companyName: "Acme",
    });
    expect(decision.draft.responsibilities).toEqual(["Coder"]);
    expect(decision.draft.requirements).toEqual(["React"]);
  });

  it("sets expiry 72 hours after publication, never after collection", () => {
    const decision = decideIngestion(offer(), NOW);
    if (decision.outcome === "REJECTED") throw new Error("attendu accepté");

    expect(decision.draft.expiresAt.toISOString()).toBe("2026-07-20T09:00:00.000Z");
  });

  it("rejects a job that is not development, and names the stage", () => {
    const decision = decideIngestion(offer({ title: "Alternance - Chargé de recrutement" }), NOW);

    expect(decision).toMatchObject({ outcome: "REJECTED", stage: "classification" });
  });

  it("rejects an offer outside Île-de-France before looking at anything else", () => {
    const decision = decideIngestion(offer({ locationLabel: "Berlin, Berlin, Germany" }), NOW);

    expect(decision).toMatchObject({ outcome: "REJECTED", stage: "localisation" });
  });

  it("rejects an offer whose department cannot be pinned, because it is not storable", () => {
    // « France » ne donne aucun département ; Job.departmentCode est NOT NULL.
    const decision = decideIngestion(offer({ locationLabel: "France" }), NOW);

    expect(decision).toMatchObject({ outcome: "REJECTED", stage: "localisation" });
  });

  it("rejects a dated-but-too-old offer", () => {
    const decision = decideIngestion(
      offer({ publishedAt: new Date("2026-07-13T09:00:00.000Z") }),
      NOW,
    );

    expect(decision).toMatchObject({ outcome: "REJECTED", stage: "fraîcheur" });
  });

  it("treats a date without time as its whole day, not its first instant", () => {
    // « 2026-07-14 » vaut minuit UTC. Lu au premier instant, l'offre a 84 h et
    // tomberait ; la source ne dit pourtant que « publiée le 14 ».
    const decision = decideIngestion(
      offer({ publishedAt: new Date("2026-07-14T00:00:00.000Z") }),
      NOW,
    );

    expect(decision.outcome).toBe("ACCEPTED");
    if (decision.outcome === "REJECTED") throw new Error("attendu accepté");
    // La date stockée reste minuit : c'est la décision qui élargit la journée.
    expect(decision.draft.publishedAt.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    // L'expiration suit la même référence, sinon l'offre naîtrait déjà expirée.
    expect(decision.draft.expiresAt.toISOString()).toBe("2026-07-17T23:59:59.999Z");
  });

  it("keeps the 72-hour window at its real bound, not four whole days", () => {
    // Le 13 à minuit : journée élargie au 13 à 23 h 59, + 72 h = 16 à 23 h 59,
    // déjà passé le 17 à 12 h. Une date seule ne repousse pas le seuil d'un jour.
    const decision = decideIngestion(
      offer({ publishedAt: new Date("2026-07-13T00:00:00.000Z") }),
      NOW,
    );

    expect(decision).toMatchObject({ outcome: "REJECTED", stage: "fraîcheur" });
  });

  it("rejects an offer with no reliable date rather than quarantining it", () => {
    // La quarantaine suppose une offre stockable ; sans date, elle ne l'est pas.
    const decision = decideIngestion(offer({ publishedAt: null }), NOW);

    expect(decision).toMatchObject({ outcome: "REJECTED", stage: "fraîcheur" });
  });

  it("quarantines a complete offer whose contract signals disagree", () => {
    // Titre « alternance », mais la source annonce « Permanent ».
    const decision = decideIngestion(offer({ commitmentLabel: "Permanent" }), NOW);

    expect(decision.outcome).toBe("QUARANTINED");
    if (decision.outcome === "REJECTED") throw new Error("attendu quarantaine");
    expect(decision.draft.status).toBe("QUARANTINED");
    expect(decision.draft.departmentCode).toBe("75");
  });

  it("defaults the work mode to on-site when the source does not state it", () => {
    const decision = decideIngestion(offer({ locationLabel: "Paris" }), NOW);
    if (decision.outcome === "REJECTED") throw new Error("attendu accepté");

    expect(decision.draft.workMode).toBe("ONSITE");
  });

  it("keeps the work mode the location label carries", () => {
    const decision = decideIngestion(offer({ locationLabel: "Hybrid - Paris" }), NOW);
    if (decision.outcome === "REJECTED") throw new Error("attendu accepté");

    expect(decision.draft.workMode).toBe("HYBRID");
  });

  it("scores completeness from what is actually present", () => {
    const rich = decideIngestion(offer({ locationLabel: "Hybrid - Paris" }), NOW);
    const bare = decideIngestion(offer({ descriptionHtml: null, locationLabel: "Paris" }), NOW);
    if (rich.outcome === "REJECTED" || bare.outcome === "REJECTED")
      throw new Error("attendu acceptés");

    expect(rich.draft.dataQualityScore).toBeGreaterThan(bare.draft.dataQualityScore);
  });

  it("still ingests a stored-but-not-shown role like data engineer", () => {
    const decision = decideIngestion(offer({ title: "Alternance Data Engineer" }), NOW);

    expect(decision).toMatchObject({ outcome: "ACCEPTED" });
    if (decision.outcome === "REJECTED") throw new Error("attendu accepté");
    expect(decision.draft.roleCategory).toBe("DATA_ENGINEER");
  });

  it("rejects an offer from a school, at the school stage", () => {
    const decision = decideIngestion(
      offer({
        companyName: "Campus Numérique",
        descriptionHtml:
          "<p>Intégrez notre formation. Nous vous plaçons dans une de nos entreprises partenaires.</p>",
      }),
      NOW,
    );

    expect(decision).toMatchObject({ outcome: "REJECTED", stage: "école" });
    // Les offres écartées ne sont pas stockées : le nom de l'employeur doit donc
    // être dans les motifs, sinon l'école refusée ne laisse aucune trace.
    if (decision.outcome === "REJECTED") {
      expect(decision.reasons[0]).toContain("Campus Numérique");
    }
  });

  it("writes the measured school risk onto an accepted offer", () => {
    const decision = decideIngestion(offer(), NOW);
    if (decision.outcome === "REJECTED") throw new Error("attendu accepté");

    // Un employeur réel : risque nul, mais le champ est bien renseigné.
    expect(decision.draft.schoolRiskScore).toBe(0);
    expect(decision.draft.schoolRiskReasons.length).toBeGreaterThan(0);
  });

  it("quarantines an offer whose name alone looks like a school", () => {
    const decision = decideIngestion(offer({ companyName: "Institut Data" }), NOW);

    expect(decision.outcome).toBe("QUARANTINED");
    if (decision.outcome === "REJECTED") throw new Error("attendu quarantaine");
    expect(decision.draft.schoolRiskScore).toBeGreaterThanOrEqual(40);
  });

  it("never decides without a reason", () => {
    for (const o of [
      offer(),
      offer({ title: "Sales Manager" }),
      offer({ locationLabel: "Lyon" }),
    ]) {
      expect(decideIngestion(o, NOW).reasons.length).toBeGreaterThan(0);
    }
  });
});
