import { describe, expect, it } from "vitest";

import { chooseApplyUrl, isJobBoardUrl } from "./apply-link.js";

describe("isJobBoardUrl", () => {
  it("recognises the boards, subdomains included", () => {
    expect(isJobBoardUrl("https://www.welcometothejungle.com/fr/companies/acme/jobs/x")).toBe(true);
    expect(isJobBoardUrl("https://fr.indeed.com/viewjob?jk=1")).toBe(true);
    expect(isJobBoardUrl("https://www.linkedin.com/jobs/view/1")).toBe(true);
    expect(isJobBoardUrl("https://www.hellowork.com/fr-fr/emplois/1.html")).toBe(true);
  });

  it("treats an employer site as an employer, even with a board name in its path", () => {
    expect(isJobBoardUrl("https://jobs.acme.test/apply/42")).toBe(false);
    expect(isJobBoardUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(false);
    expect(isJobBoardUrl("https://acme.test/careers/linkedin.com")).toBe(false);
    expect(isJobBoardUrl("https://notlinkedin.com/jobs")).toBe(false);
  });

  it("is false for anything that is not a web URL", () => {
    expect(isJobBoardUrl("pas une url")).toBe(false);
    expect(isJobBoardUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("chooseApplyUrl", () => {
  const board = "https://www.welcometothejungle.com/fr/companies/acme/jobs/x";
  const employer = "https://jobs.acme.test/apply/42";

  it("prefers the employer link over a job-board link, whatever the rank", () => {
    expect(
      chooseApplyUrl([
        { url: board, priority: 100 },
        { url: employer, priority: 10 },
      ]),
    ).toBe(employer);
  });

  it("falls back to the best-ranked board link when no employer link is known", () => {
    expect(
      chooseApplyUrl([
        { url: "https://fr.indeed.com/viewjob?jk=1", priority: 30 },
        { url: board, priority: 40 },
      ]),
    ).toBe(board);
  });

  it("takes the highest rank among employer links, then the first seen", () => {
    expect(
      chooseApplyUrl([
        { url: "https://a.test/apply", priority: 40 },
        { url: "https://b.test/apply", priority: 100 },
        { url: "https://c.test/apply", priority: 100 },
      ]),
    ).toBe("https://b.test/apply");
  });

  it("ignores links that are not web URLs, and returns null when none is valid", () => {
    expect(chooseApplyUrl([{ url: "pas une url", priority: 100 }])).toBeNull();
    expect(chooseApplyUrl([])).toBeNull();
    expect(
      chooseApplyUrl([
        { url: "javascript:alert(1)", priority: 100 },
        { url: employer, priority: 1 },
      ]),
    ).toBe(employer);
  });
});
