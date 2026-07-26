import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";

import type { CoverLetterDocumentData } from "./letter-data.js";
import { renderCoverLetterPdf } from "./render.js";

const letter: CoverLetterDocumentData = {
  senderName: "Lucas Bernard",
  senderContact: ["lucas.bernard.dev@example.com", "06 12 34 56 78", "Paris"],
  companyName: "Orbit Studio",
  jobTitle: "Alternance Développeur Front-end React",
  cityAndDate: "Paris, le 26 juillet 2026",
  subject: "Candidature à l'alternance Développeur Front-end React",
  paragraphs: [
    "Actuellement en BTS SIO option SLAM, je prépare une alternance en développement web.",
    "Lors de mon stage chez WebAgence, j'ai développé des interfaces React avec TypeScript.",
  ],
};

const pdfText = async (data: CoverLetterDocumentData): Promise<string> => {
  const buffer = await renderCoverLetterPdf(data);
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return text;
};

describe("renderCoverLetterPdf", () => {
  it("renders a real PDF carrying the letter facts and the fixed formulas", async () => {
    const buffer = await renderCoverLetterPdf(letter);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const text = await pdfText(letter);
    expect(text).toContain("Lucas Bernard");
    expect(text).toContain("Orbit Studio");
    expect(text).toContain("Objet : Candidature");
    expect(text).toContain("WebAgence");
    // Les formules d'usage viennent du modèle, pas de l'IA.
    expect(text).toContain("Madame, Monsieur,");
    expect(text).toContain("salutations distinguées");
  });

  it("keeps absent facts absent: no sender block without a name, no placeholder", async () => {
    const text = await pdfText({ ...letter, senderName: undefined, cityAndDate: undefined });
    expect(text).not.toContain("Lucas Bernard");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("le 26 juillet");
  });

  it("is deterministic on content: same data, same extracted text", async () => {
    const first = await pdfText(letter);
    const second = await pdfText(letter);
    expect(second).toBe(first);
  });
});
