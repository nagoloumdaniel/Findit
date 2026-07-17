import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractResumeText, resumeFileType, ResumeExtractionError } from "./extract-text.js";

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));

describe("resumeFileType", () => {
  it("recognises the three formats by MIME or extension", () => {
    expect(resumeFileType("application/pdf", "cv.pdf")).toBe("PDF");
    expect(resumeFileType("application/octet-stream", "cv.pdf")).toBe("PDF");
    expect(
      resumeFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cv.docx",
      ),
    ).toBe("DOCX");
    expect(resumeFileType("text/plain", "cv.txt")).toBe("TXT");
  });

  it("returns null for an unsupported format", () => {
    expect(resumeFileType("image/png", "photo.png")).toBeNull();
  });
});

describe("extractResumeText", () => {
  it("reads the text of a real PDF", async () => {
    const text = await extractResumeText(fixture("cv.pdf"), "PDF");
    expect(text).toContain("Jean Dupont");
    expect(text).toContain("React");
  });

  it("reads the text of a real DOCX", async () => {
    const text = await extractResumeText(fixture("cv.docx"), "DOCX");
    expect(text).toContain("Développeur Back-end");
    expect(text).toContain("Spring");
  });

  it("reads a plain text CV", async () => {
    const text = await extractResumeText(fixture("cv.txt"), "TXT");
    expect(text).toContain("Marie Martin");
    expect(text).toContain("Django");
  });

  it("raises rather than invents text on a corrupt file", async () => {
    await expect(extractResumeText(Buffer.from("pas un vrai pdf"), "PDF")).rejects.toBeInstanceOf(
      ResumeExtractionError,
    );
  });

  it("raises on an empty file rather than returning nothing", async () => {
    await expect(extractResumeText(Buffer.from("   \n  "), "TXT")).rejects.toBeInstanceOf(
      ResumeExtractionError,
    );
  });
});
