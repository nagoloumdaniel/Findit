import { ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it } from "vitest";

import { COLLECTION_ALLOWED_STATUSES } from "./access-policy.js";
import { createFranceTravailConnector } from "./france-travail.js";
import { greenhouseConnector } from "./greenhouse.js";
import { createHelloworkConnector } from "./hellowork.js";
import { createIndeedConnector } from "./indeed.js";
import { leverConnector } from "./lever.js";
import { createLinkedinConnector } from "./linkedin.js";
import { workableConnector } from "./workable.js";
import { workdayConnector } from "./workday.js";
import { createWttjConnector } from "./wttj.js";
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
      [
        createWttjConnector({ token: "test", maxItems: 1 }),
        SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
      ],
      [
        createHelloworkConnector({ token: "test", maxItems: 1 }),
        SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
      ],
      [
        createIndeedConnector({ token: "test", maxItems: 1 }),
        SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
      ],
      [
        createLinkedinConnector({ token: "test", maxItems: 1 }),
        SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
      ],
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
    // Ces sources n'ont aucune ligne : aucune exécution possible. Les job boards
    // s'ouvrent un par un, à leur brique (phase 22) ; Welcome to the Jungle et
    // HelloWork sont ouverts (TASK-306, TASK-402), Indeed (TASK-403) et LinkedIn
    // (décision du 2026-10-05, autorisation de construire le 2026-10-07) aussi.
    for (const name of [
      "ashby",
      "glassdoor",
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
