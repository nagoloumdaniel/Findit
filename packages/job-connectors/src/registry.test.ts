import { ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it } from "vitest";

import { COLLECTION_ALLOWED_STATUSES } from "./access-policy.js";
import { createFranceTravailConnector } from "./france-travail.js";
import { greenhouseConnector } from "./greenhouse.js";
import { leverConnector } from "./lever.js";
import { workableConnector } from "./workable.js";
import { workdayConnector } from "./workday.js";
import { CONNECTOR_REGISTRY_ENTRIES } from "./registry.js";

const entryFor = (name: string) =>
  CONNECTOR_REGISTRY_ENTRIES.find((candidate) => candidate.name === name);

describe("CONNECTOR_REGISTRY_ENTRIES", () => {
  it("names each source once", () => {
    const names = CONNECTOR_REGISTRY_ENTRIES.map((entry) => entry.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("never leaves a connector active under a regime that forbids collection", () => {
    const wronglyActive = CONNECTOR_REGISTRY_ENTRIES.filter(
      (entry) =>
        entry.status === ConnectorStatus.ACTIVE &&
        !COLLECTION_ALLOWED_STATUSES.includes(entry.accessStatus),
    );

    expect(wronglyActive).toEqual([]);
  });

  it("never activates a source whose terms were never checked", () => {
    const uncheckedButActive = CONNECTOR_REGISTRY_ENTRIES.filter(
      (entry) => entry.status === ConnectorStatus.ACTIVE && entry.termsCheckedAt === null,
    );

    expect(uncheckedButActive).toEqual([]);
  });

  it("holds a line for every connector that exists, under the name it answers to", () => {
    const franceTravailConnector = createFranceTravailConnector({
      clientId: "test",
      clientSecret: "test",
    });

    // Chaque connecteur sous le régime que sa vérification a établi : flux
    // public, API officielle de l'État, ou crawl permis par robots.txt.
    const regimes = [
      [greenhouseConnector, SourceAccessStatus.PUBLIC_FEED],
      [leverConnector, SourceAccessStatus.PUBLIC_FEED],
      [workableConnector, SourceAccessStatus.PUBLIC_FEED],
      [franceTravailConnector, SourceAccessStatus.OFFICIAL_API],
      [workdayConnector, SourceAccessStatus.AUTHORIZED_CRAWL],
    ] as const;

    for (const [connector, accessStatus] of regimes) {
      const entry = entryFor(connector.name);

      expect(entry).toBeDefined();
      expect(entry?.atsKind).toBe(connector.atsKind);
      expect(entry?.status).toBe(ConnectorStatus.ACTIVE);
      expect(entry?.accessStatus).toBe(accessStatus);
    }
  });

  it("holds no line for the sources the register found closed", () => {
    // Ces sources ont été retirées du registre : aucune ligne, donc aucune
    // exécution possible.
    for (const name of [
      "ashby",
      "linkedin",
      "indeed",
      "glassdoor",
      "welcome-to-the-jungle",
      "smartrecruiters",
      "smartrecruiters-www",
      "teamtailor",
      "recruitee",
      "successfactors",
    ]) {
      expect(entryFor(name)).toBeUndefined();
    }
  });

  it("holds a line for Workable, the source that grants ai-input", () => {
    expect(entryFor("workable")).toMatchObject({
      status: ConnectorStatus.ACTIVE,
      accessStatus: SourceAccessStatus.PUBLIC_FEED,
    });
    expect(entryFor("workable")?.notes).toContain("ai-input=yes");
  });
});
