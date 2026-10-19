import { describe, expect, it } from "vitest";

import { extractResumeText, resumeFileType, ResumeExtractionError } from "./extract-text.js";

describe("resumeFileType", () => {
  it("reconnaît les trois formats à leur type MIME", () => {
    expect(resumeFileType("application/pdf", "cv.pdf")).toBe("PDF");
    expect(
      resumeFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cv.docx",
      ),
    ).toBe("DOCX");
    expect(resumeFileType("text/plain", "cv.txt")).toBe("TXT");
  });

  it("reconnaît le format à l'extension quand le type MIME est vague", () => {
    expect(resumeFileType("application/octet-stream", "cv.pdf")).toBe("PDF");
    expect(resumeFileType("application/octet-stream", "cv.docx")).toBe("DOCX");
  });

  it("refuse un type hors périmètre", () => {
    expect(resumeFileType("image/png", "photo.png")).toBeNull();
  });
});

describe("extractResumeText", () => {
  it("extrait et nettoie le texte d'un TXT", async () => {
    const text = await extractResumeText(Buffer.from("  Hello   world \n\n\n  "), "TXT");
    expect(text).toBe("Hello world");
  });

  it("lève quand le fichier ne contient aucun texte", async () => {
    await expect(extractResumeText(Buffer.from("   \n  "), "TXT")).rejects.toBeInstanceOf(
      ResumeExtractionError,
    );
  });
});
