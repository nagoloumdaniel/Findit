import type { PrismaClient } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import { decideDiscoveredSourceAccess } from "./board-access.js";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const FRESH_TERMS = new Date("2026-10-06T00:00:00.000Z");

/** Faux Prisma : une seule ligne de registre, celle que le test veut. */
const prismaWith = (registration: unknown): PrismaClient =>
  ({
    connector: { findUnique: vi.fn().mockResolvedValue(registration) },
  }) as unknown as PrismaClient;

describe("decideDiscoveredSourceAccess", () => {
  it("laisse passer un site carrière inconnu, gouverné par robots.txt", async () => {
    const verdict = await decideDiscoveredSourceAccess(
      prismaWith(null),
      "https://careers.acme.example/jobs/1",
      NOW,
    );

    expect(verdict).toMatchObject({ allowed: true, reason: "CAREER_SITE" });
  });

  it("refuse un job board connu qu'aucun connecteur ne dessert", async () => {
    for (const url of [
      "https://fr.linkedin.com/jobs/developpeur-emplois",
      "https://www.glassdoor.fr/Emploi/developpeur-emplois-SRCH.htm",
    ]) {
      const verdict = await decideDiscoveredSourceAccess(prismaWith(null), url, NOW);
      expect(verdict).toMatchObject({ allowed: false, reason: "NO_CONNECTOR" });
    }
  });

  it("laisse passer un board desservi par un connecteur actif et autorisé", async () => {
    const prisma = prismaWith({
      name: "indeed",
      accessStatus: "OWNER_ACCEPTED_SCRAPING",
      status: "ACTIVE",
      termsCheckedAt: FRESH_TERMS,
    });

    const verdict = await decideDiscoveredSourceAccess(
      prisma,
      "https://fr.indeed.com/q-alternance-emplois.html",
      NOW,
    );

    expect(verdict).toMatchObject({ allowed: true, reason: "REGISTERED" });
  });

  it("refuse un connecteur dont les conditions n'ont jamais été vérifiées", async () => {
    const prisma = prismaWith({
      name: "indeed",
      accessStatus: "OWNER_ACCEPTED_SCRAPING",
      status: "ACTIVE",
      termsCheckedAt: null,
    });

    const verdict = await decideDiscoveredSourceAccess(
      prisma,
      "https://fr.indeed.com/q-alternance-emplois.html",
      NOW,
    );

    expect(verdict).toMatchObject({ allowed: false, reason: "COLLECTION_FORBIDDEN" });
  });

  it("refuse un board dont le connecteur n'a pas de ligne en base", async () => {
    const verdict = await decideDiscoveredSourceAccess(
      prismaWith(null),
      "https://www.hellowork.com/fr-fr/emploi/developpeur.html",
      NOW,
    );

    expect(verdict).toMatchObject({ allowed: false, reason: "NO_REGISTRATION" });
  });

  it("suit le registre pour un hôte d'ATS : fermer le connecteur ferme le crawl", async () => {
    const open = prismaWith({
      name: "lever",
      accessStatus: "PUBLIC_FEED",
      status: "ACTIVE",
      termsCheckedAt: FRESH_TERMS,
    });
    await expect(
      decideDiscoveredSourceAccess(open, "https://jobs.lever.co/theodo", NOW),
    ).resolves.toMatchObject({ allowed: true, reason: "REGISTERED" });

    const closed = prismaWith({
      name: "lever",
      accessStatus: "PUBLIC_FEED",
      status: "DISABLED_PENDING_PERMISSION",
      termsCheckedAt: FRESH_TERMS,
    });
    await expect(
      decideDiscoveredSourceAccess(closed, "https://jobs.lever.co/theodo", NOW),
    ).resolves.toMatchObject({ allowed: false, reason: "COLLECTION_FORBIDDEN" });
  });
});
