import { describe, expect, it } from "vitest";

import { collectDiscoveries, recognizeTarget } from "./discovery.js";
import type { WebSearchResult } from "./web-search.js";

const result = (url: string, title = "Alternance - Développeur - Acme"): WebSearchResult => ({
  url,
  title,
  description: "",
  host: (() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })(),
});

describe("recognizeTarget", () => {
  it("pulls the company token from a real Greenhouse result", () => {
    // URL réelle relevée via Brave le 2026-07-17.
    const target = recognizeTarget(
      result("https://boards.greenhouse.io/ivalua/jobs/4567", "Alternance - Développeur | Ivalua"),
    );

    expect(target).toMatchObject({
      kind: "known",
      connectorName: "greenhouse",
      target: { atsIdentifier: "ivalua", companyName: "Alternance" },
    });
  });

  it("recognizes the job-boards host Greenhouse also uses", () => {
    expect(
      recognizeTarget(result("https://job-boards.greenhouse.io/mirakllabs/jobs/999")),
    ).toMatchObject({
      kind: "known",
      connectorName: "greenhouse",
      target: { atsIdentifier: "mirakllabs" },
    });
  });

  it("pulls the company from a real Lever result", () => {
    expect(recognizeTarget(result("https://jobs.lever.co/spotify/66acb66f-de37"))).toMatchObject({
      kind: "known",
      connectorName: "lever",
      target: { atsIdentifier: "spotify" },
    });
  });

  it("cuts the query string that broke the naive extraction", () => {
    // « sonymusiccareersfrance?t=bfa50cc62us » ne doit rendre que le nom.
    expect(
      recognizeTarget(result("https://boards.greenhouse.io/sonymusiccareersfrance?t=bfa50cc62us")),
    ).toMatchObject({ target: { atsIdentifier: "sonymusiccareersfrance" } });
  });

  it("refuses the /embed/ path robots.txt forbids", () => {
    expect(
      recognizeTarget(result("https://boards.greenhouse.io/embed/job_app?for=acme")),
    ).toBeNull();
  });

  it("returns nothing for an ATS root with no company", () => {
    expect(recognizeTarget(result("https://jobs.lever.co/"))).toBeNull();
  });

  it("marks an unknown domain as unknown rather than collectable", () => {
    // Un site carrière découvert n'est pas une source prête : il relève du
    // registre dynamique, pas d'un connecteur existant.
    expect(recognizeTarget(result("https://careers.acme.com/jobs/dev-alternance"))).toMatchObject({
      kind: "unknown",
      host: "careers.acme.com",
    });
  });

  it("keeps aggregators out, as unknown and never collectable here", () => {
    for (const url of [
      "https://fr.indeed.com/q-dev",
      "https://www.welcometothejungle.com/fr/jobs/x",
    ]) {
      expect(recognizeTarget(result(url))).toMatchObject({ kind: "unknown" });
    }
  });

  it("returns nothing for a malformed url", () => {
    expect(recognizeTarget(result("not a url"))).toBeNull();
  });
});

describe("collectDiscoveries", () => {
  it("collects each company once, keeping every url that found it", () => {
    // ivalua remonte de deux offres différentes : une entreprise, deux preuves.
    const outcome = collectDiscoveries([
      result("https://boards.greenhouse.io/ivalua/jobs/1"),
      result("https://boards.greenhouse.io/ivalua/jobs/2"),
      result("https://boards.greenhouse.io/mirakllabs/jobs/3"),
      result("https://jobs.lever.co/qonto/abc"),
    ]);

    expect(outcome.known).toHaveLength(3);
    const ivalua = outcome.known.find((k) => k.target.atsIdentifier === "ivalua");
    expect(ivalua?.sourceUrls).toEqual([
      "https://boards.greenhouse.io/ivalua/jobs/1",
      "https://boards.greenhouse.io/ivalua/jobs/2",
    ]);
  });

  it("treats the same company on two ATS as two targets", () => {
    const outcome = collectDiscoveries([
      result("https://boards.greenhouse.io/acme/jobs/1"),
      result("https://jobs.lever.co/acme/xyz"),
    ]);

    expect(outcome.known).toHaveLength(2);
  });

  it("does not confuse a company's letter case", () => {
    const outcome = collectDiscoveries([
      result("https://boards.greenhouse.io/Ivalua/jobs/1"),
      result("https://boards.greenhouse.io/ivalua/jobs/2"),
    ]);

    expect(outcome.known).toHaveLength(1);
  });

  it("gathers unknown hosts once, apart from the collectable ones", () => {
    const outcome = collectDiscoveries([
      result("https://careers.acme.com/a"),
      result("https://careers.acme.com/b"),
      result("https://boards.greenhouse.io/ivalua/jobs/1"),
    ]);

    expect(outcome.unknownHosts).toEqual([
      {
        host: "careers.acme.com",
        sourceUrls: ["https://careers.acme.com/a", "https://careers.acme.com/b"],
      },
    ]);
    expect(outcome.known).toHaveLength(1);
  });
});
