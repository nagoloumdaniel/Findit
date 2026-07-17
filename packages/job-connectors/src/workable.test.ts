import { AtsKind, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import type { SearchTarget } from "./connector.js";
import type { RunConnectorDeps } from "./run.js";
import { runConnector } from "./run.js";
import { WORKABLE_CONNECTOR_NAME, WorkableShapeError, workableConnector } from "./workable.js";

/*
 * Forme relevée sur https://jobs.workable.com/api/v1/jobs le 2026-07-17.
 * Workable rend la localisation déjà découpée : aucune autre source vérifiée
 * ne le fait.
 */
const realJob = {
  id: "9Ww3gDT17DdtBy2rbn3Rka",
  title: "Assistant.e Chargé.e Marketing France - Alternance",
  url: "https://jobs.workable.com/view/9Ww3gDT17DdtBy2rbn3Rka/assistant-marketing",
  description: "<p>Nous cherchons un profil.</p>",
  requirementsSection: "<ul><li>Bac +4</li></ul>",
  benefitsSection: "<ul><li>Tickets restaurant</li></ul>",
  created: "2026-07-17T08:08:20.393Z",
  employmentType: "Contract",
  workplace: "on_site",
  location: { city: "Paris", subregion: "Île-de-France", countryName: "France" },
  company: { id: "abc", title: "Treatwell" },
};

const target: SearchTarget = { query: "alternance développeur", location: "Paris" };

const registration: ConnectorRegistration = {
  name: WORKABLE_CONNECTOR_NAME,
  accessStatus: SourceAccessStatus.PUBLIC_FEED,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-17T00:00:00.000Z"),
};

const respondWith = (pages: readonly unknown[]) => {
  let call = 0;
  return vi.fn<typeof globalThis.fetch>(() => {
    const payload = pages[call] ?? { totalSize: 0, jobs: [] };
    call += 1;
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  });
};

const deps = (fetchImpl: typeof globalThis.fetch, sleeps: number[] = []): RunConnectorDeps => ({
  fetch: fetchImpl,
  sleep: (ms: number) => {
    sleeps.push(ms);
    return Promise.resolve();
  },
  monotonicNow: () => 0,
  now: () => new Date("2026-07-17T12:00:00.000Z"),
  correlationId: "run-1",
});

/*
 * Le connecteur demande une URL en chaîne. L'affirmer ici plutôt que de forcer
 * la conversion : si un jour il passait un objet `Request`, le test doit le
 * dire, pas l'aplatir en « [object Object] ».
 */
const urlOf = (call: readonly unknown[] | undefined): string => {
  const input = call?.[0];
  if (typeof input !== "string") {
    throw new Error("Le connecteur doit demander une URL en chaîne.");
  }

  return input;
};

describe("workableConnector", () => {
  it("aims at a search, not at a company board", () => {
    expect(workableConnector.name).toBe("workable");
    expect(workableConnector.atsKind).toBe(AtsKind.WORKABLE);
    expect(workableConnector.minRequestIntervalMs).toBe(1000);
  });

  it("asks the documented endpoint with the search it was given", async () => {
    const fetchStub = respondWith([{ totalSize: 0, jobs: [] }]);

    await runConnector(workableConnector, registration, target, deps(fetchStub));

    const url = urlOf(fetchStub.mock.calls[0]);
    expect(url).toContain("https://jobs.workable.com/api/v1/jobs?");
    expect(url).toContain("query=alternance+d%C3%A9veloppeur");
    expect(url).toContain("location=Paris");
  });

  it("reads a real posting, keeping the payload it came from", async () => {
    const fetchStub = respondWith([{ totalSize: 1, jobs: [realJob] }]);

    const outcome = await runConnector(workableConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]).toEqual({
      sourceJobId: "9Ww3gDT17DdtBy2rbn3Rka",
      url: "https://jobs.workable.com/view/9Ww3gDT17DdtBy2rbn3Rka/assistant-marketing",
      title: "Assistant.e Chargé.e Marketing France - Alternance",
      locationLabel: "Paris, Île-de-France, France",
      descriptionHtml:
        "<p>Nous cherchons un profil.</p>\n<ul><li>Bac +4</li></ul>\n<ul><li>Tickets restaurant</li></ul>",
      publishedAt: new Date("2026-07-17T08:08:20.393Z"),
      rawContent: JSON.stringify(realJob),
      contentType: "application/json",
    });
  });

  it("writes the structured location in the order the rest of the chain reads", async () => {
    const fetchStub = respondWith([{ totalSize: 1, jobs: [realJob] }]);

    const outcome = await runConnector(workableConnector, registration, target, deps(fetchStub));

    // « Paris, Île-de-France, France » est exactement la forme que Greenhouse
    // produit naturellement. Rien n'est inventé : les trois morceaux viennent
    // de la source.
    expect(outcome.jobs[0]?.locationLabel).toBe("Paris, Île-de-France, France");
  });

  it("keeps the requirements and the benefits, which description alone drops", async () => {
    const fetchStub = respondWith([{ totalSize: 1, jobs: [realJob] }]);

    const outcome = await runConnector(workableConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]?.descriptionHtml).toContain("Bac +4");
    expect(outcome.jobs[0]?.descriptionHtml).toContain("Tickets restaurant");
  });

  it("follows the page token the source hands back, and stops when it stops", async () => {
    const sleeps: number[] = [];
    const fetchStub = respondWith([
      { totalSize: 3, nextPageToken: "token-2", jobs: [realJob] },
      { totalSize: 3, nextPageToken: null, jobs: [{ ...realJob, id: "second" }] },
    ]);

    const outcome = await runConnector(
      workableConnector,
      registration,
      target,
      deps(fetchStub, sleeps),
    );

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(urlOf(fetchStub.mock.calls[1])).toContain("pageToken=token-2");
    expect(outcome.jobs.map((job) => job.sourceJobId)).toEqual([
      "9Ww3gDT17DdtBy2rbn3Rka",
      "second",
    ]);
    expect(sleeps).toEqual([1000]);
  });

  it("accepts a posting with no location and no date rather than inventing them", async () => {
    const fetchStub = respondWith([
      { totalSize: 1, jobs: [{ ...realJob, location: null, created: null }] },
    ]);

    const outcome = await runConnector(workableConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]).toMatchObject({ locationLabel: null, publishedAt: null });
  });

  it("raises when the envelope changed shape instead of reporting an empty search", async () => {
    const fetchStub = respondWith([{ results: [] }]);

    await expect(
      runConnector(workableConnector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(WorkableShapeError);
  });

  it("stays unrunnable while the registry does not allow it", async () => {
    const fetchStub = respondWith([{ totalSize: 1, jobs: [realJob] }]);

    await expect(
      runConnector(
        workableConnector,
        { ...registration, status: ConnectorStatus.DISABLED_PENDING_PERMISSION },
        target,
        deps(fetchStub),
      ),
    ).rejects.toMatchObject({ reason: "CONNECTOR_NOT_ACTIVE" });

    expect(fetchStub).not.toHaveBeenCalled();
  });
});
