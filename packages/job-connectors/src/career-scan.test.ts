import { describe, expect, it } from "vitest";

import { extractAtsReferences } from "./career-scan.js";

describe("extractAtsReferences", () => {
  it("finds the ATS boards a career page links to", () => {
    // Formes réelles : lien direct, lien Lever, site Workday avec langue.
    const html = [
      "<a href='https://boards.greenhouse.io/ivalua/jobs/4567'>Nos offres</a>",
      '<a href="https://jobs.lever.co/qonto">Rejoignez-nous</a>',
      "<script>var url='https://acme.wd3.myworkdayjobs.com/fr-FR/AcmeCareers/job/Paris/Dev_JR-1';</script>",
    ].join("\n");

    expect(extractAtsReferences(html)).toEqual([
      {
        connectorName: "greenhouse",
        atsIdentifier: "ivalua",
        atsHost: "boards.greenhouse.io",
        evidenceUrl: "https://boards.greenhouse.io/ivalua/jobs/4567",
      },
      {
        connectorName: "lever",
        atsIdentifier: "qonto",
        atsHost: "jobs.lever.co",
        evidenceUrl: "https://jobs.lever.co/qonto",
      },
      {
        connectorName: "workday",
        atsIdentifier: "acme.wd3.myworkdayjobs.com/AcmeCareers",
        atsHost: "acme.wd3.myworkdayjobs.com",
        evidenceUrl: "https://acme.wd3.myworkdayjobs.com/fr-FR/AcmeCareers/job/Paris/Dev_JR-1",
      },
    ]);
  });

  it("reads the greenhouse token from an embed without ever visiting /embed/", () => {
    // L'iframe d'intégration nomme le jeton en paramètre ; la collecte, elle,
    // passera par l'API de board autorisée, jamais par /embed/.
    const html =
      '<iframe src="https://boards.greenhouse.io/embed/job_board?for=sonymusic&b=https%3A%2F%2Fexample.com"></iframe>';

    expect(extractAtsReferences(html)).toEqual([
      {
        connectorName: "greenhouse",
        atsIdentifier: "sonymusic",
        atsHost: "boards.greenhouse.io",
        evidenceUrl: "boards.greenhouse.io/embed/job_board?for=sonymusic",
      },
    ]);
  });

  it("names each board once, however many links point at it", () => {
    const html = [
      "https://boards.greenhouse.io/ivalua",
      "https://boards.greenhouse.io/Ivalua/jobs/1",
      "https://boards.greenhouse.io/embed/job_board?for=ivalua",
    ].join(" ");

    expect(extractAtsReferences(html)).toHaveLength(1);
  });

  it("ignores hosts Findit cannot collect", () => {
    const html = [
      "https://www.linkedin.com/jobs/view/123",
      "https://fr.indeed.com/viewjob?jk=abc",
      "https://careers.acme.com/nos-offres",
      "https://jobs.smartrecruiters.com/Acme/123-dev",
    ].join(" ");

    expect(extractAtsReferences(html)).toEqual([]);
  });
});
