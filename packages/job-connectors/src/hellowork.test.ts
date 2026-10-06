import { AtsKind } from "@findit/database";
import { describe, expect, it } from "vitest";

import { ApifyItemError } from "./apify.js";
import { UnboundedRunError } from "./spend-budget.js";
import {
  HELLOWORK_CONNECTOR_NAME,
  HELLOWORK_MAX_ITEMS_CEILING,
  HelloworkInputError,
  createHelloworkConnector,
  mapHelloworkItem,
} from "./hellowork.js";

const item = {
  jobId: "84108803",
  jobUrl: "https://www.hellowork.com/fr-fr/emplois/84108803.html",
  title: "Développeuse - Développeur Logiciel Plm - Stage H/F",
  company: "Capgemini",
  city: "Issy-les-Moulineaux",
  location: "Issy-les-Moulineaux - 92",
  datePosted: "2026-10-05",
  descriptionHtml: "<p>Le poste</p>",
  descriptionText: "Le poste",
};

describe("mapHelloworkItem", () => {
  it("maps the fields the actor really returns, keeping the origin link", () => {
    expect(mapHelloworkItem(item)).toEqual({
      sourceJobId: "84108803",
      url: "https://www.hellowork.com/fr-fr/emplois/84108803.html",
      title: "Développeuse - Développeur Logiciel Plm - Stage H/F",
      locationLabel: "Issy-les-Moulineaux",
      descriptionHtml: "<p>Le poste</p>",
      publishedAt: new Date("2026-10-05"),
      companyName: "Capgemini",
      rawContent: JSON.stringify(item),
      contentType: "application/json",
    });
  });

  it("prefers the clean city over the department-suffixed location", () => {
    expect(mapHelloworkItem({ ...item, city: "Paris" }).locationLabel).toBe("Paris");
    expect(mapHelloworkItem({ ...item, city: null }).locationLabel).toBe(
      "Issy-les-Moulineaux - 92",
    );
  });

  it("names a missing employer 'Inconnu' instead of inventing one", () => {
    expect(mapHelloworkItem({ ...item, company: null }).companyName).toBe("Inconnu");
  });

  it("falls back to the plain-text description when the HTML one is missing", () => {
    expect(mapHelloworkItem({ ...item, descriptionHtml: null }).descriptionHtml).toBe("Le poste");
  });

  it("leaves an unreadable date null instead of guessing one", () => {
    expect(mapHelloworkItem({ ...item, datePosted: "pas une date" }).publishedAt).toBeNull();
  });

  it("refuses an item with no id, no origin link or no title", () => {
    expect(() => mapHelloworkItem({ ...item, jobId: "" })).toThrow(ApifyItemError);
    expect(() => mapHelloworkItem({ ...item, jobUrl: "" })).toThrow(ApifyItemError);
    expect(() => mapHelloworkItem({ ...item, title: "" })).toThrow(ApifyItemError);
  });
});

describe("createHelloworkConnector", () => {
  const target = { query: "développeur", location: "Île-de-France" };

  it("is the job-board connector the registry names, and declares its worst case up front", () => {
    const connector = createHelloworkConnector({ token: "t", maxItems: 20 });

    expect(connector.name).toBe(HELLOWORK_CONNECTOR_NAME);
    expect(connector.atsKind).toBe(AtsKind.JOB_BOARD);
    // 50 + 20 x 950 = 19 050 micro-dollars, soit 0,01905 $.
    expect(connector.estimateCostMicroUsd?.(target)).toBe(19_050);
  });

  it("refuses a cap above the absolute ceiling or no cap at all", () => {
    expect(() =>
      createHelloworkConnector({ token: "t", maxItems: HELLOWORK_MAX_ITEMS_CEILING + 1 }),
    ).toThrow(UnboundedRunError);
    expect(() => createHelloworkConnector({ token: "t", maxItems: 0 })).toThrow(UnboundedRunError);
  });

  it("builds a bounded input: alternance and stage, Île-de-France, 3 days, capped results", async () => {
    let body: unknown = null;
    const connector = createHelloworkConnector({ token: "t", maxItems: 20 });

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
      searchQueries: ["développeur"],
      location: "Île-de-France",
      contractType: ["ALTERNANCE", "STAGE"],
      datePosted: "3d",
      maxResults: 20,
    });
  });

  it("refuses a zone it does not know, before any request", async () => {
    const connector = createHelloworkConnector({ token: "t", maxItems: 20 });
    let requests = 0;

    await expect(
      connector.collect(
        {} as never,
        { query: "dev", location: "Auvergne-Rhône-Alpes" },
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
    ).rejects.toBeInstanceOf(HelloworkInputError);

    expect(requests).toBe(0);
  });
});
