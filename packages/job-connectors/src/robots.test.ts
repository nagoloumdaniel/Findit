import { describe, expect, it } from "vitest";

import { FINDIT_USER_AGENT } from "./http.js";
import { decideRobots, parseContentSignal, parseRobots } from "./robots.js";

/*
 * Ces cinq fichiers sont réels, relevés le 2026-07-17. Ce sont eux qui ont
 * décidé du sort de chaque source dans docs/legal-compliance.md.
 */
const GREENHOUSE = `User-agent: *
Disallow: /embed/`;

const LEVER = `User-agent: *
Allow: /
Crawl-delay: 1`;

const WORKABLE_APPLY = `User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Disallow: `;

const WORKABLE_JOBS = `User-agent: *
Allow: /search/*
Disallow: /search*?*
Disallow: /search
Disallow: */search/$
Disallow: /profile*
Disallow: /company-login-unauthorized

Sitemap: https://jobs.workable.com/sitemap.xml`;

const SMARTRECRUITERS = `User-agent: LinkedInBot
Allow: /v1/companies/

User-agent: *
Disallow: /`;

const decide = (text: string, path: string, agent = FINDIT_USER_AGENT) =>
  decideRobots(parseRobots(text), agent, path);

describe("decideRobots", () => {
  it("refuses SmartRecruiters, whose API is opened to LinkedIn alone", () => {
    // Le cas qui compte le plus : l'API répondrait 200, et se faire passer pour
    // LinkedInBot est interdit par les règles absolues du projet.
    expect(decide(SMARTRECRUITERS, "/v1/companies/acme/postings")).toMatchObject({
      verdict: "DISALLOWED",
    });
  });

  it("gives LinkedIn the group that names it, not the catch-all", () => {
    expect(
      decideRobots(parseRobots(SMARTRECRUITERS), "LinkedInBot/1.0", "/v1/companies/x"),
    ).toMatchObject({ verdict: "ALLOWED" });
  });

  it("lets Greenhouse's job path through, and holds its embed path", () => {
    expect(decide(GREENHOUSE, "/v1/boards/vercel/jobs")).toMatchObject({ verdict: "ALLOWED" });
    expect(decide(GREENHOUSE, "/embed/job_board")).toMatchObject({ verdict: "DISALLOWED" });
  });

  it("reads the crawl delay Lever imposes", () => {
    expect(decide(LEVER, "/v0/postings/spotify")).toMatchObject({
      verdict: "ALLOWED",
      crawlDelayMs: 1000,
    });
  });

  it("reads an empty Disallow as a permission, because that is what it is", () => {
    // Workable écrit « Disallow: » sans valeur : rien n'est interdit.
    expect(decide(WORKABLE_APPLY, "/api/v1/widget/accounts/acme")).toMatchObject({
      verdict: "ALLOWED",
    });
  });

  it("keeps Workable's api path out of the rules aimed at its search pages", () => {
    expect(decide(WORKABLE_JOBS, "/api/v1/jobs?query=alternance")).toMatchObject({
      verdict: "ALLOWED",
    });
    expect(decide(WORKABLE_JOBS, "/profile/me")).toMatchObject({ verdict: "DISALLOWED" });
  });

  it("honours the wildcard and the end anchor rather than matching by prefix alone", () => {
    expect(decide(WORKABLE_JOBS, "/search?q=x")).toMatchObject({ verdict: "DISALLOWED" });
    // « Allow: /search/* » est plus précis que « Disallow: /search ».
    expect(decide(WORKABLE_JOBS, "/search/developer")).toMatchObject({ verdict: "ALLOWED" });
  });

  it("says it does not know rather than assuming a yes", () => {
    const decision = decide("User-agent: GoogleBot\nDisallow: /", "/anything");

    expect(decision).toMatchObject({ verdict: "UNKNOWN" });
    expect(decision.detail).toContain("Aucun groupe");
  });

  it("ignores comments, including at the end of a line", () => {
    expect(
      decide("User-agent: *  # tout le monde\nDisallow: /admin  # privé", "/admin"),
    ).toMatchObject({ verdict: "DISALLOWED" });
  });

  it("collects the sitemaps a file announces", () => {
    expect(parseRobots(WORKABLE_JOBS).sitemaps).toEqual(["https://jobs.workable.com/sitemap.xml"]);
  });
});

describe("parseContentSignal", () => {
  it("reads the two forms the real sources write", () => {
    const lever = parseContentSignal("search=yes,ai-train=no,use=reference");
    const workable = parseContentSignal("search=yes, ai-input=yes, ai-train=no");

    expect(lever.get("search")).toBe("yes");
    expect(lever.get("ai-train")).toBe("no");
    expect(workable.get("ai-input")).toBe("yes");
  });

  it("leaves an undeclared use undefined rather than reading silence as consent", () => {
    // Lever ne déclare pas ai-input. Le rendre « no » serait aussi faux que le
    // rendre « yes » : il n'a rien dit.
    expect(
      parseContentSignal("search=yes,ai-train=no,use=reference").get("ai-input"),
    ).toBeUndefined();
  });

  it("reads nothing from a source that declares nothing", () => {
    expect(parseContentSignal(null).size).toBe(0);
  });

  it("carries the signal through to the decision", () => {
    expect(decide(WORKABLE_APPLY, "/api/x").contentSignal).toBe(
      "search=yes, ai-input=yes, ai-train=no",
    );
  });
});
