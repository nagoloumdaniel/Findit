import { AtsKind } from "@findit/database";
import { describe, expect, it } from "vitest";

import { ApifyItemError } from "./apify.js";
import { UnboundedRunError } from "./spend-budget.js";
import {
  WTTJ_CONNECTOR_NAME,
  WTTJ_MAX_ITEMS_CEILING,
  WttjInputError,
  createWttjConnector,
  mapWttjItem,
} from "./wttj.js";

const item = {
  objectID: "abc123",
  name: "Alternance Developpeur Full-Stack",
  publicUrl: "https://www.welcometothejungle.com/fr/companies/acme/jobs/alternance-dev_paris",
  published_at: "2026-10-05T08:30:00.000Z",
  organization: { name: "Acme" },
  office: { city: "Paris" },
  apply_url: "https://jobs.acme.test/apply/42",
  description: "<p>Le poste</p>",
  description_text: "Le poste",
  contract_type: "apprenticeship",
};

describe("mapWttjItem", () => {
  it("maps the fields the actor really returns, and keeps the origin and apply links", () => {
    expect(mapWttjItem(item)).toEqual({
      sourceJobId: "abc123",
      url: "https://www.welcometothejungle.com/fr/companies/acme/jobs/alternance-dev_paris",
      title: "Alternance Developpeur Full-Stack",
      locationLabel: "Paris",
      descriptionHtml: "<p>Le poste</p>",
      publishedAt: new Date("2026-10-05T08:30:00.000Z"),
      companyName: "Acme",
      applyUrl: "https://jobs.acme.test/apply/42",
      rawContent: JSON.stringify(item),
      contentType: "application/json",
    });
  });

  it("invents nothing: a missing apply link, city, date or description stays null", () => {
    const job = mapWttjItem({
      objectID: "x",
      name: "Stage",
      publicUrl: "https://www.welcometothejungle.com/fr/companies/acme/jobs/x",
      organization: { name: "Acme" },
    });

    expect(job.applyUrl).toBeNull();
    expect(job.locationLabel).toBeNull();
    expect(job.publishedAt).toBeNull();
    expect(job.descriptionHtml).toBeNull();
  });

  it("falls back to the plain-text description when the HTML one is missing", () => {
    expect(mapWttjItem({ ...item, description: undefined }).descriptionHtml).toBe("Le poste");
  });

  it("leaves an unreadable date null instead of guessing one", () => {
    expect(mapWttjItem({ ...item, published_at: "pas une date" }).publishedAt).toBeNull();
  });

  it("refuses an item with no employer or no origin link: the offer cannot be attributed or traced", () => {
    expect(() => mapWttjItem({ ...item, organization: undefined })).toThrow(ApifyItemError);
    expect(() => mapWttjItem({ ...item, publicUrl: "" })).toThrow(ApifyItemError);
    expect(() => mapWttjItem({ ...item, name: "" })).toThrow(ApifyItemError);
  });
});

describe("createWttjConnector", () => {
  const target = { query: "développeur", location: "Île-de-France, France" };

  it("is the job-board connector the registry names, and declares its worst case up front", () => {
    const connector = createWttjConnector({ token: "t", maxItems: 20 });

    expect(connector.name).toBe(WTTJ_CONNECTOR_NAME);
    expect(connector.atsKind).toBe(AtsKind.JOB_BOARD);
    // 50 + 20 x (300 + 500) = 16 050 micro-dollars, soit 0,01605 $.
    expect(connector.estimateCostMicroUsd?.(target)).toBe(16_050);
  });

  it("refuses a cap above the absolute ceiling or no cap at all", () => {
    expect(() => createWttjConnector({ token: "t", maxItems: WTTJ_MAX_ITEMS_CEILING + 1 })).toThrow(
      UnboundedRunError,
    );
    expect(() => createWttjConnector({ token: "t", maxItems: 0 })).toThrow(UnboundedRunError);
  });

  it("builds a bounded input: tech profession, apprenticeship and internship, 3 days, Paris radius, details on", async () => {
    let body: unknown = null;
    const connector = createWttjConnector({ token: "t", maxItems: 20 });

    await expect(
      connector.collect({} as never, target, {
        fetchJson: (_url, init) => {
          body = JSON.parse(init?.body ?? "{}");
          return Promise.reject(new Error("arret apres lecture de l'entree"));
        },
        fetchText: () => Promise.resolve(""),
        now: () => new Date(),
        correlationId: "c",
        reportCostMicroUsd: () => undefined,
        reportNotice: () => undefined,
      }),
    ).rejects.toThrow("arret apres lecture");

    expect(body).toMatchObject({
      action: "get-jobs",
      profession: "global_tech",
      contractType: ["APPRENTICESHIP", "INTERNSHIP"],
      postedWithinDays: 3,
      latitude: "48.8566",
      longitude: "2.3522",
      radiusKm: 50,
      includeDetails: true,
      maxItems: 20,
    });
  });

  it("refuses a zone it has no centre for, before any request", async () => {
    const connector = createWttjConnector({ token: "t", maxItems: 20 });
    let requests = 0;

    await expect(
      connector.collect(
        {} as never,
        { query: "dev", location: "Marseille, France" },
        {
          fetchJson: () => {
            requests += 1;
            return Promise.resolve(null);
          },
          fetchText: () => Promise.resolve(""),
          now: () => new Date(),
          correlationId: "c",
          reportCostMicroUsd: () => undefined,
          reportNotice: () => undefined,
        },
      ),
    ).rejects.toBeInstanceOf(WttjInputError);

    expect(requests).toBe(0);
  });
});
