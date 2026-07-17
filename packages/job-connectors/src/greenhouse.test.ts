import { AtsKind, ConnectorStatus, SourceAccessStatus } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import type { ConnectorRegistration } from "./access-policy.js";
import type { CollectionTarget } from "./connector.js";
import {
  GREENHOUSE_CONNECTOR_NAME,
  GreenhouseShapeError,
  greenhouseConnector,
} from "./greenhouse.js";
import type { RunConnectorDeps } from "./run.js";
import { runConnector } from "./run.js";

/*
 * Forme relevée sur la réponse réelle de
 * https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true
 * le 2026-07-17. Les champs que le connecteur n'utilise pas sont conservés :
 * ils partent en `rawContent` et doivent y arriver intacts.
 */
const realJob = {
  absolute_url: "https://job-boards.greenhouse.io/vercel/jobs/5999792004",
  internal_job_id: 5156316004,
  location: { name: "Hybrid - London" },
  id: 5999792004,
  updated_at: "2026-06-29T14:01:38-04:00",
  requisition_id: "1240",
  title: "Account Executive, Majors",
  company_name: "Vercel",
  first_published: "2026-05-21T09:26:09-04:00",
  language: "en",
  application_deadline: null,
  content:
    "&lt;div class=&quot;content-intro&quot;&gt;&lt;h2&gt;About Vercel&lt;/h2&gt;\n&lt;p&gt;Ship &amp; iterate&lt;/p&gt;&lt;/div&gt;",
  departments: [{ id: 4085775004, name: "Account Executive" }],
  offices: [{ id: 4091069004, name: "Office - London" }],
};

const boardPayload = (jobs: readonly unknown[]): unknown => ({
  jobs,
  meta: { total: jobs.length },
});

const target: CollectionTarget = { atsIdentifier: "vercel", companyName: "Vercel" };

const registration: ConnectorRegistration = {
  name: GREENHOUSE_CONNECTOR_NAME,
  accessStatus: SourceAccessStatus.PUBLIC_FEED,
  status: ConnectorStatus.ACTIVE,
  termsCheckedAt: new Date("2026-07-17T00:00:00.000Z"),
};

const respondWith = (payload: unknown) =>
  vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

const deps = (fetchImpl: typeof globalThis.fetch): RunConnectorDeps => ({
  fetch: fetchImpl,
  sleep: () => Promise.resolve(),
  monotonicNow: () => 0,
  now: () => new Date("2026-07-17T12:00:00.000Z"),
  correlationId: "run-1",
});

describe("greenhouseConnector", () => {
  it("declares the identity the registry expects and the prudent pace", () => {
    expect(greenhouseConnector.name).toBe("greenhouse");
    expect(greenhouseConnector.atsKind).toBe(AtsKind.GREENHOUSE);
    expect(greenhouseConnector.minRequestIntervalMs).toBe(1000);
  });

  it("asks the documented board endpoint, outside the path robots.txt forbids", async () => {
    const fetchStub = respondWith(boardPayload([]));

    await runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    const [url] = fetchStub.mock.calls[0] ?? [];
    expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true");
    expect(url).not.toContain("/embed/");
  });

  it("reads a real job into a raw job, keeping the payload it came from", async () => {
    const fetchStub = respondWith(boardPayload([realJob]));

    const outcome = await runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs).toHaveLength(1);
    expect(outcome.jobs[0]).toEqual({
      sourceJobId: "5999792004",
      url: "https://job-boards.greenhouse.io/vercel/jobs/5999792004",
      title: "Account Executive, Majors",
      locationLabel: "Hybrid - London",
      descriptionHtml:
        '<div class="content-intro"><h2>About Vercel</h2>\n<p>Ship & iterate</p></div>',
      publishedAt: new Date("2026-05-21T09:26:09-04:00"),
      rawContent: JSON.stringify(realJob),
      contentType: "application/json",
    });
  });

  it("takes the whole board in a single request", async () => {
    const fetchStub = respondWith(
      boardPayload([realJob, { ...realJob, id: 2 }, { ...realJob, id: 3 }]),
    );

    const outcome = await runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    expect(fetchStub).toHaveBeenCalledOnce();
    expect(outcome.requestCount).toBe(1);
    expect(outcome.jobs.map((job) => job.sourceJobId)).toEqual(["5999792004", "2", "3"]);
  });

  it("dates a job by its first publication, never by its last update", async () => {
    const fetchStub = respondWith(
      boardPayload([
        {
          ...realJob,
          first_published: "2026-05-21T09:26:09-04:00",
          updated_at: "2026-07-17T09:00:00-04:00",
        },
      ]),
    );

    const outcome = await runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]?.publishedAt).toEqual(new Date("2026-05-21T09:26:09-04:00"));
  });

  it("leaves a job undated rather than passing an unusable date off as fresh", async () => {
    const fetchStub = respondWith(
      boardPayload([
        { ...realJob, first_published: null },
        { ...realJob, id: 2, first_published: "pas une date" },
      ]),
    );

    const outcome = await runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs.map((job) => job.publishedAt)).toEqual([null, null]);
  });

  it("escapes nothing back into HTML that was not HTML to begin with", async () => {
    // Le texte d'origine contenait « &lt; » littéral : Greenhouse le rend
    // « &amp;lt; ». Il doit rester du texte, pas devenir une balise.
    const fetchStub = respondWith(
      boardPayload([
        { ...realJob, content: "&lt;p&gt;Écrire &amp;lt;div&amp;gt; en clair&lt;/p&gt;" },
      ]),
    );

    const outcome = await runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]?.descriptionHtml).toBe("<p>Écrire &lt;div&gt; en clair</p>");
  });

  it("accepts a job with no description and no location", async () => {
    const fetchStub = respondWith(boardPayload([{ ...realJob, content: null, location: null }]));

    const outcome = await runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    expect(outcome.jobs[0]).toMatchObject({ descriptionHtml: null, locationLabel: null });
  });

  it("raises when the envelope changed shape instead of reporting an empty board", async () => {
    const fetchStub = respondWith({ postings: [] });

    await expect(
      runConnector(greenhouseConnector, registration, target, deps(fetchStub)),
    ).rejects.toBeInstanceOf(GreenhouseShapeError);
  });

  it("names the offending job when one entry became unreadable", async () => {
    const fetchStub = respondWith(boardPayload([realJob, { ...realJob, title: undefined }]));

    const run = runConnector(greenhouseConnector, registration, target, deps(fetchStub));

    await expect(run).rejects.toBeInstanceOf(GreenhouseShapeError);
    await expect(run).rejects.toThrowError(/l'offre à l'indice 1/);
  });

  it("stays unrunnable while the registry does not allow it", async () => {
    const fetchStub = respondWith(boardPayload([realJob]));

    await expect(
      runConnector(
        greenhouseConnector,
        { ...registration, status: ConnectorStatus.DISABLED_PENDING_PERMISSION },
        target,
        deps(fetchStub),
      ),
    ).rejects.toMatchObject({ reason: "CONNECTOR_NOT_ACTIVE" });

    expect(fetchStub).not.toHaveBeenCalled();
  });
});
