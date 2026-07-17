import { ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it } from "vitest";

import { COLLECTION_ALLOWED_STATUSES } from "./access-policy.js";
import { greenhouseConnector } from "./greenhouse.js";
import { leverConnector } from "./lever.js";
import { workableConnector } from "./workable.js";
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
    for (const connector of [greenhouseConnector, leverConnector, workableConnector]) {
      const entry = entryFor(connector.name);

      expect(entry).toBeDefined();
      expect(entry?.atsKind).toBe(connector.atsKind);
      expect(entry?.status).toBe(ConnectorStatus.ACTIVE);
      expect(entry?.accessStatus).toBe(SourceAccessStatus.PUBLIC_FEED);
    }
  });

  it("keeps the sources the register found closed, closed", () => {
    for (const name of [
      "ashby",
      "linkedin",
      "indeed",
      "glassdoor",
      "welcome-to-the-jungle",
      "smartrecruiters",
      "teamtailor",
      "recruitee",
      "workday",
    ]) {
      expect(entryFor(name)).toMatchObject({
        accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
        status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
      });
    }
  });

  it("leaves unverified sources without a check date rather than inventing one", () => {
    // SmartRecruiters a quitté cette liste le 2026-07-17 : il est vérifié, et
    // fermé. Son robots.txt n'ouvre l'API qu'à LinkedInBot.
    for (const name of ["teamtailor", "recruitee", "workday"]) {
      expect(entryFor(name)?.termsCheckedAt).toBeNull();
    }
  });

  it("records that a verified source can be verified as closed", () => {
    expect(entryFor("smartrecruiters")).toMatchObject({
      status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    });
    expect(entryFor("smartrecruiters")?.termsCheckedAt).not.toBeNull();
    expect(entryFor("smartrecruiters")?.notes).toContain("LinkedInBot");
  });

  it("holds a line for Workable, the source that grants ai-input", () => {
    expect(entryFor("workable")).toMatchObject({
      status: ConnectorStatus.ACTIVE,
      accessStatus: SourceAccessStatus.PUBLIC_FEED,
    });
    expect(entryFor("workable")?.notes).toContain("ai-input=yes");
  });
});
