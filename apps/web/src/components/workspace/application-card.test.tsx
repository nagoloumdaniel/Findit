import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ApplicationView } from "../../lib/workspace-api";
import { ApplicationCard } from "./application-card";

const application: ApplicationView = {
  id: "app-1",
  jobSlug: "demo-alternance-developpeur-front-end-react-paris",
  jobTitle: "Alternance - Développeur Front-end React H/F",
  companyName: "Orbit Studio",
  jobStillExists: false,
  resumeFileName: "mon-cv.pdf",
  matchScore: 93,
  letterSubject: "Candidature",
  letterParagraphs: [],
  status: "APPLIED",
  notes: "Relancer dans une semaine.",
  appliedAt: "2026-07-26T10:00:00.000Z",
  createdAt: "2026-07-25T10:00:00.000Z",
  updatedAt: "2026-07-26T10:00:00.000Z",
  events: [
    { status: "TO_APPLY", note: null, occurredAt: "2026-07-25T10:00:00.000Z" },
    { status: "APPLIED", note: "Envoyée via le site.", occurredAt: "2026-07-26T10:00:00.000Z" },
  ],
};

const noop = () => undefined;

describe("ApplicationCard", () => {
  it("shows the snapshots, the dated history and the survival of the offer", () => {
    const html = renderToStaticMarkup(
      <ApplicationCard
        application={application}
        busy={false}
        onChangeStatus={noop}
        onSaveNotes={noop}
        onDelete={noop}
      />,
    );

    expect(html).toContain("Alternance - Développeur Front-end React H/F");
    expect(html).toContain("Envoyée");
    // L'offre disparue est signalée, le dossier reste.
    expect(html).toContain("offre retirée du flux (dossier conservé)");
    expect(html).toContain("mon-cv.pdf");
    expect(html).toContain("93/100");
    expect(html).toContain("lettre jointe au dossier");
    expect(html).toContain("Envoyée via le site.");
    expect(html).toContain("Relancer dans une semaine.");
    expect(html).toContain("À postuler");
  });
});
