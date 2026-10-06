import { ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import {
  COLLECTION_ALLOWED_STATUSES,
  TERMS_MAX_AGE_DAYS,
  decideCollectionAccess,
} from "./access-policy.js";

const now = new Date("2026-07-17T12:00:00.000Z");
const daysBefore = (days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const registration = (overrides: Partial<ConnectorRegistration> = {}): ConnectorRegistration => ({
  name: "greenhouse",
  accessStatus: SourceAccessStatus.PUBLIC_FEED,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: daysBefore(1),
  ...overrides,
});

describe("decideCollectionAccess", () => {
  it("allows a registered, active source whose terms were checked recently", () => {
    expect(decideCollectionAccess("greenhouse", registration(), now)).toEqual({ allowed: true });
  });

  it("allows exactly the four documented collection regimes and no other", () => {
    const allowed = Object.values(SourceAccessStatus).filter(
      (accessStatus) =>
        decideCollectionAccess("greenhouse", registration({ accessStatus }), now).allowed,
    );

    expect(allowed).toEqual([
      SourceAccessStatus.OFFICIAL_API,
      SourceAccessStatus.PUBLIC_FEED,
      SourceAccessStatus.AUTHORIZED_CRAWL,
      SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
    ]);
    expect(allowed).toEqual([...COLLECTION_ALLOWED_STATUSES]);
  });

  it("still refuses a prohibited or permission-pending source after the owner decision", () => {
    for (const accessStatus of [
      SourceAccessStatus.PROHIBITED,
      SourceAccessStatus.DISABLED_PENDING_PERMISSION,
      SourceAccessStatus.SEARCH_ENGINE_DISCOVERY_ONLY,
      SourceAccessStatus.MANUAL_IMPORT,
    ]) {
      expect(
        decideCollectionAccess("indeed", registration({ name: "indeed", accessStatus }), now),
      ).toMatchObject({ allowed: false, reason: "ACCESS_STATUS_FORBIDS_COLLECTION" });
    }
  });

  it("applies the same terms-review delay to an owner-accepted source", () => {
    const base = { accessStatus: SourceAccessStatus.OWNER_ACCEPTED_SCRAPING };
    expect(
      decideCollectionAccess("greenhouse", registration({ ...base, termsCheckedAt: null }), now),
    ).toMatchObject({ allowed: false, reason: "TERMS_NEVER_CHECKED" });
    expect(
      decideCollectionAccess(
        "greenhouse",
        registration({ ...base, termsCheckedAt: daysBefore(TERMS_MAX_AGE_DAYS + 1) }),
        now,
      ),
    ).toMatchObject({ allowed: false, reason: "TERMS_CHECK_EXPIRED" });
  });

  it("refuses a source that is only allowed to be discovered through a search engine", () => {
    expect(
      decideCollectionAccess(
        "linkedin",
        registration({
          name: "linkedin",
          accessStatus: SourceAccessStatus.SEARCH_ENGINE_DISCOVERY_ONLY,
        }),
        now,
      ),
    ).toMatchObject({ allowed: false, reason: "ACCESS_STATUS_FORBIDS_COLLECTION" });
  });

  it("refuses a source awaiting permission, whatever the connector state says", () => {
    expect(
      decideCollectionAccess(
        "ashby",
        registration({
          name: "ashby",
          accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
          status: ConnectorStatus.ACTIVE,
        }),
        now,
      ),
    ).toMatchObject({ allowed: false, reason: "ACCESS_STATUS_FORBIDS_COLLECTION" });
  });

  it("refuses a connector that is not active", () => {
    for (const status of [
      ConnectorStatus.DISABLED,
      ConnectorStatus.DISABLED_PENDING_PERMISSION,
      ConnectorStatus.FAILING,
    ]) {
      expect(decideCollectionAccess("greenhouse", registration({ status }), now)).toMatchObject({
        allowed: false,
        reason: "CONNECTOR_NOT_ACTIVE",
      });
    }
  });

  it("refuses a source whose terms were never checked", () => {
    expect(
      decideCollectionAccess("greenhouse", registration({ termsCheckedAt: null }), now),
    ).toMatchObject({ allowed: false, reason: "TERMS_NEVER_CHECKED" });
  });

  it("refuses a terms check older than the review delay, and accepts it on the last day", () => {
    expect(
      decideCollectionAccess(
        "greenhouse",
        registration({ termsCheckedAt: daysBefore(TERMS_MAX_AGE_DAYS + 1) }),
        now,
      ),
    ).toMatchObject({ allowed: false, reason: "TERMS_CHECK_EXPIRED" });

    expect(
      decideCollectionAccess(
        "greenhouse",
        registration({ termsCheckedAt: daysBefore(TERMS_MAX_AGE_DAYS) }),
        now,
      ),
    ).toEqual({ allowed: true });
  });

  it("refuses a connector presented with another source's registration", () => {
    expect(decideCollectionAccess("lever", registration(), now)).toMatchObject({
      allowed: false,
      reason: "REGISTRATION_MISMATCH",
    });
  });
});
