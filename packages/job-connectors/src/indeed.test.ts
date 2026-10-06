import { AtsKind } from "@findit/database";
import { describe, expect, it } from "vitest";

import { ApifyItemError } from "./apify.js";
import { UnboundedRunError } from "./spend-budget.js";
import {
  INDEED_CONNECTOR_NAME,
  INDEED_MAX_ITEMS_CEILING,
  createIndeedConnector,
  mapIndeedItem,
} from "./indeed.js";

const item = {
  id: "3992021ae3992c51",
  viewJobLink: "/viewjob?jk=3992021ae3992c51",
  title: "Java Développeur",
  companyDetails: { name: "VISIAN" },
  jobLocationCity: "Paris",
  formattedLocation: "Paris (75)",
  pubDate: 1791176400000,
  jobDescriptionHTML: "<b>Le poste</b>",
  jobDescription: "Le poste",
  originalApplyUrl: "https://www.free-work.com/fr/tech-it/job-mission/developpeur-java",
};

describe("mapIndeedItem", () => {
  it("maps the fields the actor really returns, making the relative link absolute", () => {
    expect(mapIndeedItem(item)).toEqual({
      sourceJobId: "3992021ae3992c51",
      url: "https://fr.indeed.com/viewjob?jk=3992021ae3992c51",
      title: "Java Développeur",
      locationLabel: "Paris",
      descriptionHtml: "<b>Le poste</b>",
      publishedAt: new Date(1791176400000),
      companyName: "VISIAN",
      applyUrl: "https://www.free-work.com/fr/tech-it/job-mission/developpeur-java",
      rawContent: JSON.stringify(item),
      contentType: "application/json",
    });
  });

  it("keeps an already absolute view link as is", () => {
    expect(mapIndeedItem({ ...item, viewJobLink: "https://fr.indeed.com/viewjob?jk=x" }).url).toBe(
      "https://fr.indeed.com/viewjob?jk=x",
    );
  });

  it("names a missing employer 'Inconnu' instead of inventing one", () => {
    expect(mapIndeedItem({ ...item, companyDetails: null }).companyName).toBe("Inconnu");
  });

  it("falls back to the plain-text description when the HTML one is missing", () => {
    expect(mapIndeedItem({ ...item, jobDescriptionHTML: null }).descriptionHtml).toBe("Le poste");
  });

  it("leaves an unreadable date null instead of guessing one", () => {
    expect(mapIndeedItem({ ...item, pubDate: null }).publishedAt).toBeNull();
  });

  it("refuses an item with no id, no link or no title", () => {
    expect(() => mapIndeedItem({ ...item, id: "" })).toThrow(ApifyItemError);
    expect(() => mapIndeedItem({ ...item, viewJobLink: "" })).toThrow(ApifyItemError);
    expect(() => mapIndeedItem({ ...item, title: "" })).toThrow(ApifyItemError);
  });
});

describe("createIndeedConnector", () => {
  const target = { query: "alternance développeur", location: "Île-de-France" };

  it("is the job-board connector the registry names, and declares its worst case up front", () => {
    const connector = createIndeedConnector({ token: "t", maxItems: 20 });

    expect(connector.name).toBe(INDEED_CONNECTOR_NAME);
    expect(connector.atsKind).toBe(AtsKind.JOB_BOARD);
    // 100 + 20 x 100 = 2 100 micro-dollars, soit 0,0021 $.
    expect(connector.estimateCostMicroUsd?.(target)).toBe(2_100);
  });

  it("refuses a cap above the absolute ceiling or no cap at all", () => {
    expect(() =>
      createIndeedConnector({ token: "t", maxItems: INDEED_MAX_ITEMS_CEILING + 1 }),
    ).toThrow(UnboundedRunError);
    expect(() => createIndeedConnector({ token: "t", maxItems: 0 })).toThrow(UnboundedRunError);
  });

  it("builds a bounded input: fr, the query, Île-de-France, 3 days, capped results", async () => {
    let body: unknown = null;
    const connector = createIndeedConnector({ token: "t", maxItems: 20 });

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

    expect(body).toEqual({
      country: "fr",
      query: "alternance développeur",
      location: "Île-de-France",
      postedWithinDays: "3",
      count: 20,
    });
  });
});
