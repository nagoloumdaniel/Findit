import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ResumeDetail, ResumeSummary } from "../../lib/workspace-api";
import { ResumeCard } from "./resume-card";

const summary = (over: Partial<ResumeSummary> = {}): ResumeSummary => ({
  id: "3f1d3f44-0000-7000-8000-000000000001",
  fileType: "TXT",
  originalFileName: "mon-cv.txt",
  fileSize: 781,
  textLength: 757,
  structuredAt: null,
  structuredConfidence: null,
  expiresAt: "2026-07-27T10:00:00.000Z",
  createdAt: "2026-07-26T10:00:00.000Z",
  ...over,
});

const noop = () => undefined;

const render = (
  resume: ResumeSummary,
  detail: ResumeDetail | null = null,
  progress: number | null = null,
) =>
  renderToStaticMarkup(
    <ResumeCard
      resume={resume}
      detail={detail}
      busy={progress === null ? null : "structure"}
      progress={progress}
      onStructure={noop}
      onShowFacts={noop}
      onDownloadCv={noop}
      onDelete={noop}
    />,
  );

describe("ResumeCard", () => {
  it("shows what the system knows about an unstructured resume, nothing more", () => {
    const html = render(summary());

    expect(html).toContain("mon-cv.txt");
    expect(html).toContain("Pas encore structuré");
    expect(html).toContain("757");
    // Les actions qui exigent la structuration sont désactivées, pas cachées.
    expect(html).toContain("disabled");
    expect(html).not.toContain("Compétences :");
  });

  it("shows the estimated progress as an estimate, never as a measure", () => {
    const html = render(summary(), null, 42);

    expect(html).toContain("progressbar");
    expect(html).toContain("width:42%");
    expect(html).toContain("estimation");
  });

  it("shows confidence and facts once structured", () => {
    const structured = summary({
      structuredAt: "2026-07-26T11:00:00.000Z",
      structuredConfidence: 92,
    });
    const detail: ResumeDetail = {
      ...structured,
      extractedText: "…",
      structured: {
        facts: {
          identity: { fullName: "Lucas Bernard", title: "Développeur front-end junior" },
          skills: [{ name: "TypeScript" }, { name: "React" }],
          languages: [{ name: "Anglais", level: "B2" }],
          experiences: [],
          education: [],
        },
        warnings: ["Dates du stage non normalisées."],
        confidence: 92,
        structuredAt: "2026-07-26T11:00:00.000Z",
      },
    };

    const html = render(structured, detail);

    expect(html).toContain("confiance 92/100");
    expect(html).toContain("Lucas Bernard");
    expect(html).toContain("TypeScript, React");
    expect(html).toContain("Anglais (B2)");
    expect(html).toContain("Dates du stage non normalisées.");
  });
});
