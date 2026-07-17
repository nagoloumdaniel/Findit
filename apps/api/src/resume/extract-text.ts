import { extractText as extractPdfText } from "unpdf";

/** Formats de CV acceptés, alignés sur l'enum `ResumeFileType` en base. */
export type ResumeFileType = "PDF" | "DOCX" | "TXT";

export class ResumeExtractionError extends Error {
  override readonly name = "ResumeExtractionError";
}

/**
 * Reconnaît le format d'un fichier à son type MIME et à son nom. Les deux sont
 * fournis par le client, donc non fiables : ils sont un indice, pas une preuve.
 * Un contenu qui ne s'extrait pas dans le format annoncé lèvera à l'extraction.
 */
export const resumeFileType = (mimeType: string, fileName: string): ResumeFileType | null => {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    return "PDF";
  }
  if (mime.includes("wordprocessingml") || mime.includes("msword") || name.endsWith(".docx")) {
    return "DOCX";
  }
  if (mime.startsWith("text/") || name.endsWith(".txt")) {
    return "TXT";
  }

  return null;
};

/** Réduit les blancs sans écraser la structure : lignes gardées, espaces resserrés. */
const tidy = (text: string): string =>
  text
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

/**
 * Extrait le texte d'un CV. Chaque format a son lecteur : `unpdf` (pdf.js) pour
 * le PDF, `mammoth` pour le DOCX, l'UTF-8 pour le texte.
 *
 * Rien n'est inventé : un fichier illisible ou vide lève plutôt que de rendre
 * un texte fabriqué. Ce qui n'a pas pu être lu doit se voir.
 */
export const extractResumeText = async (
  buffer: Buffer,
  fileType: ResumeFileType,
): Promise<string> => {
  let text: string;

  try {
    if (fileType === "PDF") {
      // `extractText` accepte les octets directement, ce qui évite un proxy
      // pdf.js dont le type ne se résout pas proprement.
      const result = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else if (fileType === "DOCX") {
      // Import différé : mammoth tire des dépendances lourdes qu'on ne charge
      // qu'à la première extraction DOCX.
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString("utf8");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "cause inconnue";
    throw new ResumeExtractionError(`Le fichier ${fileType} n'a pas pu être lu : ${detail}.`);
  }

  const cleaned = tidy(text);
  if (cleaned === "") {
    throw new ResumeExtractionError(
      `Le fichier ${fileType} ne contient aucun texte extractible (peut-être une image scannée).`,
    );
  }

  return cleaned;
};
