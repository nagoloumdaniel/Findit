import { describe, expect, it } from "vitest";

import { FINDIT_USER_AGENT } from "./http.js";
import { decideRobots, parseRobots } from "./robots.js";

/*
 * Ces fichiers sont les mêmes que ceux relevés dans
 * packages/job-connectors/src/robots.test.ts : la logique est copiée, le test
 * doit rester vert ici aussi.
 */
const GREENHOUSE = `User-agent: *
Disallow: /embed/`;

const LEVER = `User-agent: *
Allow: /
Crawl-delay: 1`;

const SMARTRECRUITERS = `User-agent: LinkedInBot
Allow: /v1/companies/

User-agent: *
Disallow: /`;

const WORKABLE_JOBS = `User-agent: *
Allow: /search/*
Disallow: /search*?*
Disallow: /search
Disallow: */search/$
Disallow: /profile*
Disallow: /company-login-unauthorized

Sitemap: https://jobs.workable.com/sitemap.xml`;

const decide = (text: string, path: string, agent = FINDIT_USER_AGENT) =>
  decideRobots(parseRobots(text), agent, path);

describe("decideRobots (copie)", () => {
  it("refuse le chemin interdit", () => {
    expect(decide(GREENHOUSE, "/embed/job_board")).toMatchObject({ verdict: "DISALLOWED" });
  });

  it("laisse passer le chemin autorisé et lit le Crawl-delay", () => {
    expect(decide(LEVER, "/v0/postings/acme")).toMatchObject({
      verdict: "ALLOWED",
      crawlDelayMs: 1000,
    });
  });

  it("ne se fait pas passer pour LinkedInBot", () => {
    expect(decide(SMARTRECRUITERS, "/v1/companies/acme/postings")).toMatchObject({
      verdict: "DISALLOWED",
    });
  });

  it("distingue l'interdiction du chemin et l'autorisation plus précise", () => {
    expect(decide(WORKABLE_JOBS, "/search?q=x")).toMatchObject({ verdict: "DISALLOWED" });
    expect(decide(WORKABLE_JOBS, "/search/developer")).toMatchObject({ verdict: "ALLOWED" });
  });

  it("dit qu'il ne sait pas plutôt que d'imaginer un oui", () => {
    expect(decide("User-agent: GoogleBot\nDisallow: /", "/anything")).toMatchObject({
      verdict: "UNKNOWN",
    });
  });
});
