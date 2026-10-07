import { AtsKind } from "@findit/database";
import { describe, expect, it } from "vitest";

import { ApifyItemError } from "./apify.js";
import type { CollectionContext } from "./connector.js";
import type { JsonRequestInit } from "./http.js";
import {
  LINKEDIN_ACTOR_ID,
  LINKEDIN_CONNECTOR_NAME,
  LINKEDIN_FRESHNESS_HOURS,
  LINKEDIN_MAX_ITEMS_CEILING,
  LinkedinInputError,
  createLinkedinConnector,
  isWithinLinkedinWindow,
  mapLinkedinItem,
} from "./linkedin.js";
import { UnboundedRunError } from "./spend-budget.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");

/*
 * Élément aux noms de champs du registre (`id`, `link`, `companyName`,
 * `location`, `postedAt`, `applyUrl`), complété des `jobPoster*` que l'acteur
 * rend réellement et que nous devons ignorer.
 */
const item = {
  id: "4123456789",
  link: "https://www.linkedin.com/jobs/view/4123456789",
  title: "Alternance Développeur Full Stack",
  companyName: "Acme",
  location: "Paris, Île-de-France, France",
  postedAt: "2026-10-06T09:00:00.000Z",
  applyUrl: "https://acme.example/jobs/42",
  description: "<p>Le poste</p>",
  jobPosterName: "Camille Recruteuse",
  jobPosterTitle: "Talent Acquisition",
  jobPosterProfileUrl: "https://www.linkedin.com/in/camille",
};

const target = { query: "alternance développeur", location: "Île-de-France, France" };

interface FakeApify {
  readonly seen: { readonly url: string; readonly body: string | undefined }[];
  readonly notices: { readonly kind: string; readonly message: string }[];
  readonly context: CollectionContext;
}

/**
 * Doublure de l'API Apify : elle joue le cycle départ → sondages → jeu de
 * données et garde les requêtes reçues. Aucun appel réseau réel.
 */
const fakeApify = (items: unknown): FakeApify => {
  const seen: { url: string; body: string | undefined }[] = [];
  const notices: { kind: string; message: string }[] = [];
  let runPolls = 0;

  const runState = (status: string, count: number) => ({
    data: {
      id: "run-1",
      status,
      defaultDatasetId: "dataset-1",
      chargedEventCounts: { "apify-default-dataset-item": count },
    },
  });

  const fetchJson = (url: string, init?: JsonRequestInit): Promise<unknown> => {
    seen.push({ url, body: init?.body });

    if (init?.method === "POST" && url.includes("/acts/")) {
      return Promise.resolve(runState("READY", 0));
    }
    if (url.includes("/actor-runs/")) {
      runPolls += 1;
      return Promise.resolve(
        runState(runPolls === 1 ? "RUNNING" : "SUCCEEDED", Array.isArray(items) ? items.length : 0),
      );
    }
    if (url.includes("/datasets/")) {
      return Promise.resolve(items);
    }
    return Promise.resolve(null);
  };

  return {
    seen,
    notices,
    context: {
      fetchJson,
      fetchText: () => Promise.resolve(""),
      now: () => NOW,
      correlationId: "correlation-linkedin",
      reportCostMicroUsd: () => undefined,
      reportNotice: (kind, message) => {
        notices.push({ kind, message });
      },
    },
  };
};

describe("mapLinkedinItem", () => {
  it("mappe les champs que le registre donne comme réels", () => {
    const mapped = mapLinkedinItem(item);

    expect(mapped).toMatchObject({
      sourceJobId: "4123456789",
      url: "https://www.linkedin.com/jobs/view/4123456789",
      title: "Alternance Développeur Full Stack",
      companyName: "Acme",
      locationLabel: "Paris, Île-de-France, France",
      publishedAt: new Date("2026-10-06T09:00:00.000Z"),
      applyUrl: "https://acme.example/jobs/42",
      descriptionHtml: "<p>Le poste</p>",
      contentType: "application/json",
    });
  });

  it("ne porte et ne conserve aucune donnée de recruteur", () => {
    const mapped = mapLinkedinItem(item);
    const recruiterKey = /poster|recruiter/i;

    expect(Object.keys(mapped).filter((key) => recruiterKey.test(key))).toEqual([]);

    // `rawContent` est une liste blanche : les jobPoster* de l'acteur n'y entrent
    // pas, car le registre interdit de les stocker.
    const raw = JSON.parse(mapped.rawContent) as Record<string, unknown>;
    expect(Object.keys(raw).filter((key) => recruiterKey.test(key))).toEqual([]);
    expect(Object.keys(raw).sort()).toEqual([
      "applyUrl",
      "companyName",
      "description",
      "descriptionHtml",
      "id",
      "link",
      "location",
      "postedAt",
      "title",
    ]);
  });

  it("refuse une offre sans identifiant, sans lien, sans titre ou sans employeur", () => {
    expect(() => mapLinkedinItem({ ...item, id: "" })).toThrow(ApifyItemError);
    expect(() => mapLinkedinItem({ ...item, link: "" })).toThrow(ApifyItemError);
    expect(() => mapLinkedinItem({ ...item, title: "" })).toThrow(ApifyItemError);
    expect(() => mapLinkedinItem({ ...item, companyName: "" })).toThrow(ApifyItemError);
    expect(() => mapLinkedinItem({ ...item, companyName: undefined })).toThrow(ApifyItemError);
  });

  it("laisse une date illisible nulle, et accepte l'époque en millisecondes", () => {
    expect(mapLinkedinItem({ ...item, postedAt: "pas une date" }).publishedAt).toBeNull();
    expect(mapLinkedinItem({ ...item, postedAt: null }).publishedAt).toBeNull();
    expect(mapLinkedinItem({ ...item, postedAt: 1_791_176_400_000 }).publishedAt).toEqual(
      new Date(1_791_176_400_000),
    );
  });

  it("accorde une description sans balise quand l'acteur n'en donne pas d'HTML", () => {
    expect(mapLinkedinItem({ ...item, description: "Le poste" }).descriptionHtml).toBe("Le poste");
  });
});

describe("isWithinLinkedinWindow", () => {
  const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

  it("garde une offre de moins de 3 jours, y compris juste à la borne", () => {
    expect(isWithinLinkedinWindow(hoursAgo(1), NOW)).toBe(true);
    expect(isWithinLinkedinWindow(hoursAgo(71), NOW)).toBe(true);
    expect(isWithinLinkedinWindow(hoursAgo(LINKEDIN_FRESHNESS_HOURS), NOW)).toBe(true);
  });

  it("écarte une offre au-delà de 3 jours, ou sans date prouvable", () => {
    expect(isWithinLinkedinWindow(hoursAgo(73), NOW)).toBe(false);
    expect(isWithinLinkedinWindow(hoursAgo(24 * 7), NOW)).toBe(false);
    expect(isWithinLinkedinWindow(null, NOW)).toBe(false);
  });
});

describe("createLinkedinConnector", () => {
  const connector = createLinkedinConnector({ token: "t", maxItems: 20 });

  it("est le connecteur de job board du registre, avec l'acteur public épinglé", () => {
    expect(connector.name).toBe(LINKEDIN_CONNECTOR_NAME);
    expect(connector.atsKind).toBe(AtsKind.JOB_BOARD);
    expect(LINKEDIN_ACTOR_ID).toBe("curious_coder/linkedin-jobs-scraper");
  });

  it("déclare le pire coût du registre : 20 résultats → 0,040 $, 100 → 0,20 $", () => {
    expect(connector.estimateCostMicroUsd?.(target)).toBe(40_000);
    expect(
      createLinkedinConnector({
        token: "t",
        maxItems: LINKEDIN_MAX_ITEMS_CEILING,
      }).estimateCostMicroUsd?.(target),
    ).toBe(200_000);
  });

  it("refuse un plafond au-dessus du maximum, ou absent", () => {
    expect(() =>
      createLinkedinConnector({ token: "t", maxItems: LINKEDIN_MAX_ITEMS_CEILING + 1 }),
    ).toThrow(UnboundedRunError);
    expect(() => createLinkedinConnector({ token: "t", maxItems: 0 })).toThrow(UnboundedRunError);
  });

  it("envoie exactement les paramètres du registre, splitByLocation désactivé", async () => {
    const { context, seen } = fakeApify([item]);

    await connector.collect({} as never, target, context);

    const start = seen[0];
    expect(start?.url).toContain("/acts/curious_coder~linkedin-jobs-scraper/runs");
    expect(JSON.parse(start?.body ?? "{}")).toEqual({
      keywords: "alternance développeur",
      location: "Île-de-France, France",
      datePosted: "pastWeek",
      scrapeCompany: false,
      splitByLocation: false,
      limitPerSource: 20,
    });
  });

  it("refuse une zone hors du périmètre du registre, avant toute requête", async () => {
    const { context, seen } = fakeApify([item]);

    await expect(
      connector.collect(
        {} as never,
        { query: "alternance développeur", location: "Auvergne-Rhône-Alpes" },
        context,
      ),
    ).rejects.toBeInstanceOf(LinkedinInputError);

    expect(seen).toHaveLength(0);
  });

  it("écarte les offres hors fenêtre de 3 jours, et le signale", async () => {
    const fresh = { ...item, id: "fraiche", postedAt: "2026-10-07T09:00:00.000Z" };
    const stale = { ...item, id: "ancienne", postedAt: "2026-10-01T09:00:00.000Z" };
    const { context, notices } = fakeApify([fresh, stale]);

    const jobs = await connector.collect({} as never, target, context);

    expect(jobs.map((job) => job.sourceJobId)).toEqual(["fraiche"]);
    expect(notices.find((notice) => notice.kind === "FreshnessDropped")?.message).toContain(
      "1 offre(s) sur 2",
    );
  });

  it("rend une collecte vide, sans échouer, quand tout est hors fenêtre", async () => {
    const stale = { ...item, postedAt: "2026-10-01T09:00:00.000Z" };
    const { context } = fakeApify([stale]);

    await expect(connector.collect({} as never, target, context)).resolves.toEqual([]);
  });

  it("rend toutes les offres quand limitPerSource est atteint pile, et lit au plus ce plafond", async () => {
    const first = { ...item, id: "un", postedAt: "2026-10-07T09:00:00.000Z" };
    const second = { ...item, id: "deux", postedAt: "2026-10-07T10:00:00.000Z" };
    const { context, seen, notices } = fakeApify([first, second]);

    const jobs = await createLinkedinConnector({ token: "t", maxItems: 2 }).collect(
      {} as never,
      target,
      context,
    );

    expect(jobs.map((job) => job.sourceJobId)).toEqual(["un", "deux"]);
    expect(notices.find((notice) => notice.kind === "ResultsCapped")).toBeUndefined();
    // La lecture du jeu de données rejoue le plafond, même si l'acteur déborde.
    expect(seen.at(-1)?.url).toContain("limit=2");
  });

  it("coupe à limitPerSource si l'acteur rend plus que le plafond, et le signale", async () => {
    const items = [1, 2, 3].map((index) => ({
      ...item,
      id: `offre-${String(index)}`,
      postedAt: "2026-10-07T09:00:00.000Z",
    }));
    const { context, notices } = fakeApify(items);

    const jobs = await createLinkedinConnector({ token: "t", maxItems: 2 }).collect(
      {} as never,
      target,
      context,
    );

    expect(jobs.map((job) => job.sourceJobId)).toEqual(["offre-1", "offre-2"]);
    expect(notices.find((notice) => notice.kind === "ResultsCapped")?.message).toContain(
      "1 offre(s) au-delà du plafond de 2",
    );
  });
});
