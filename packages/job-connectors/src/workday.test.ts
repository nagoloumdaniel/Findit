import { AtsKind, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import type { CollectionTarget } from "./connector.js";
import type { RunConnectorDeps } from "./run.js";
import { runConnector } from "./run.js";
import {
  WORKDAY_CONNECTOR_NAME,
  WorkdayRobotsError,
  WorkdayShapeError,
  workdayConnector,
} from "./workday.js";

/* Relevé sur https://workday.wd5.myworkdayjobs.com/robots.txt le 2026-07-26. */
const realRobots = ["User-agent: *", "Allow: /Workday/", "Disallow: /refreshFacet/", ""].join("\n");

/*
 * Forme relevée sur /wday/cxs/workday/Workday/jobs le 2026-07-26. `postedOn`
 * y était « Posted 30+ Days Ago » ; la valeur varie avec l'âge de l'annonce.
 */
const freshListing = {
  title: "Alternant Développeur Full-Stack",
  externalPath: "/job/France-Paris/Alternant-Developpeur_JR-0099001",
  locationsText: "France, Paris",
  postedOn: "Posted Today",
  remoteType: "Flex",
  bulletFields: ["JR-0099001"],
};

const staleListing = {
  title: "Business Development Representative UKI",
  externalPath: "/job/Ireland-Dublin/Corporate-Sales-development-UKI--Outbound-_JR-0094228",
  locationsText: "Ireland, Dublin",
  postedOn: "Posted 30+ Days Ago",
  remoteType: "Flex",
  bulletFields: ["JR-0094228"],
};

/* Forme relevée sur /wday/cxs/workday/Workday/job/<chemin> le 2026-07-26. */
const realDetail = {
  jobPostingInfo: {
    id: "7a71f06c551c1000c96e1167f3db0000",
    title: "Alternant Développeur Full-Stack",
    jobDescription: "<p>Au sein de l'équipe produit, vous développerez.</p>",
    location: "France, Paris",
    postedOn: "Posted Today",
    startDate: "2026-07-25",
    timeType: "Full time",
    jobReqId: "JR-0099001",
    externalUrl:
      "https://workday.wd5.myworkdayjobs.com/Workday/job/France-Paris/Alternant-Developpeur_JR-0099001",
  },
  hiringOrganization: { name: "Workday Limited" },
};

const target: CollectionTarget = {
  atsIdentifier: "workday.wd5.myworkdayjobs.com/Workday",
  companyName: "workday.wd5.myworkdayjobs.com/Workday",
};

const registration: ConnectorRegistration = {
  name: WORKDAY_CONNECTOR_NAME,
  accessStatus: SourceAccessStatus.AUTHORIZED_CRAWL,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-26T00:00:00.000Z"),
};

/**
 * Répond selon l'URL demandée, comme le locataire réel : le robots.txt en
 * texte, les listes en POST, le détail en GET.
 */
const respondWith = (options: {
  robots?: string;
  listings?: readonly unknown[];
  detail?: unknown;
}) => {
  return vi.fn<typeof globalThis.fetch>((input) => {
    if (typeof input !== "string") {
      throw new Error("Le connecteur doit demander une URL en chaîne.");
    }
    const url = input;

    if (url.endsWith("/robots.txt")) {
      return Promise.resolve(new Response(options.robots ?? realRobots, { status: 200 }));
    }

    if (url.endsWith("/wday/cxs/workday/Workday/jobs")) {
      const listings = options.listings ?? [];
      return Promise.resolve(
        new Response(JSON.stringify({ total: listings.length, jobPostings: listings }), {
          status: 200,
        }),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify(options.detail ?? realDetail), { status: 200 }),
    );
  });
};

const deps = (fetchImpl: typeof globalThis.fetch, sleeps: number[] = []): RunConnectorDeps => ({
  fetch: fetchImpl,
  sleep: (ms: number) => {
    sleeps.push(ms);
    return Promise.resolve();
  },
  monotonicNow: () => 0,
  now: () => new Date("2026-07-26T12:00:00.000Z"),
  correlationId: "run-1",
});

const urlOf = (call: readonly unknown[] | undefined): string => {
  const input = call?.[0];
  if (typeof input !== "string") {
    throw new Error("Le connecteur doit demander une URL en chaîne.");
  }

  return input;
};

describe("workdayConnector", () => {
  it("aims at a tenant career site, one company per host", () => {
    expect(workdayConnector.name).toBe("workday");
    expect(workdayConnector.atsKind).toBe(AtsKind.WORKDAY);
    expect(workdayConnector.minRequestIntervalMs).toBe(1000);
  });

  it("reads the tenant's robots.txt before anything else", async () => {
    const fetchStub = respondWith({ listings: [freshListing] });

    await runConnector(workdayConnector, registration, target, deps(fetchStub));

    expect(urlOf(fetchStub.mock.calls[0])).toBe("https://workday.wd5.myworkdayjobs.com/robots.txt");
  });

  it("refuses the tenant whose robots.txt does not allow the career site", async () => {
    const fetchStub = respondWith({
      robots: ["User-agent: *", "Disallow: /"].join("\n"),
      listings: [freshListing],
    });

    await expect(
      runConnector(workdayConnector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(WorkdayRobotsError);

    // Le robots.txt a été lu, rien d'autre : le refus précède toute collecte.
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("refuses a silent robots.txt rather than reading silence as consent", async () => {
    const fetchStub = respondWith({
      robots: ["User-agent: googlebot", "Allow: /"].join("\n"),
      listings: [freshListing],
    });

    await expect(
      runConnector(workdayConnector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(WorkdayRobotsError);
  });

  it("refuses a crawl-delay it cannot honour rather than ignoring it", async () => {
    const fetchStub = respondWith({
      robots: [...realRobots.split("\n"), "Crawl-delay: 10"].join("\n"),
      listings: [freshListing],
    });

    await expect(
      runConnector(workdayConnector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(WorkdayRobotsError);
  });

  it("reads a real posting through the detail, where the absolute date lives", async () => {
    const fetchStub = respondWith({ listings: [freshListing] });

    const outcome = await runConnector(workdayConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs).toEqual([
      {
        sourceJobId: "JR-0099001",
        url: "https://workday.wd5.myworkdayjobs.com/Workday/job/France-Paris/Alternant-Developpeur_JR-0099001",
        title: "Alternant Développeur Full-Stack",
        locationLabel: "France, Paris",
        descriptionHtml: "<p>Au sein de l'équipe produit, vous développerez.</p>",
        // `startDate` du détail, absolue - jamais le « Posted Today » relatif.
        publishedAt: new Date("2026-07-25"),
        companyName: "Workday Limited",
        rawContent: JSON.stringify(realDetail),
        contentType: "application/json",
      },
    ]);
  });

  it("skips postings the source says are old, without asking their detail", async () => {
    const fetchStub = respondWith({ listings: [staleListing] });

    const outcome = await runConnector(workdayConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs).toEqual([]);
    // robots.txt, puis les deux recherches : aucun détail demandé.
    const detailCalls = fetchStub.mock.calls.filter((call) => urlOf(call).includes("/job/"));
    expect(detailCalls).toEqual([]);
  });

  it("reads the French labels the same source serves to Node", async () => {
    // Relevé sur bdf.wd103.myworkdayjobs.com le 2026-07-26 : même flux, autre
    // langue selon le client. Vieux certain écarté, « hier » lu comme frais.
    const fetchStub = respondWith({
      listings: [
        { ...staleListing, postedOn: "Offre publiée il y a 30 jours ou plus" },
        {
          ...staleListing,
          externalPath: "/job/x/Vieille_JR-2",
          postedOn: "Offre publiée il y a 16 jours",
        },
        { ...freshListing, postedOn: "Offre publiée hier" },
      ],
    });

    const outcome = await runConnector(workdayConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs).toHaveLength(1);
    const detailCalls = fetchStub.mock.calls.filter((call) =>
      urlOf(call).includes("/wday/cxs/workday/Workday/job/"),
    );
    expect(detailCalls).toHaveLength(1);
  });

  it("asks the same posting's detail once even when both searches return it", async () => {
    const fetchStub = respondWith({ listings: [freshListing] });

    await runConnector(workdayConnector, registration, target, deps(fetchStub));

    const detailCalls = fetchStub.mock.calls.filter((call) =>
      urlOf(call).includes("/wday/cxs/workday/Workday/job/"),
    );
    expect(detailCalls).toHaveLength(1);
  });

  it("rejects an identifier that does not name a tenant career site", async () => {
    const fetchStub = respondWith({});

    await expect(
      runConnector(
        workdayConnector,
        registration,
        { atsIdentifier: "example.com/Careers", companyName: "example" },
        deps(fetchStub),
      ),
    ).rejects.toBeInstanceOf(WorkdayShapeError);

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("stays unrunnable while the registry does not allow it", async () => {
    const fetchStub = respondWith({ listings: [freshListing] });

    await expect(
      runConnector(
        workdayConnector,
        { ...registration, status: ConnectorStatus.DISABLED_PENDING_PERMISSION },
        target,
        deps(fetchStub),
      ),
    ).rejects.toMatchObject({ reason: "CONNECTOR_NOT_ACTIVE" });

    expect(fetchStub).not.toHaveBeenCalled();
  });
});
