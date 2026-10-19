import { renderToBuffer } from "@react-pdf/renderer";
import { extractText } from "unpdf";

import { resolveAccentColor } from "./colors.js";
import type { CvDocumentData, CvRenderOptions } from "./cv-data.js";
import { CvDocument } from "./cv-document.js";
import { buildCoverLetterDocx, buildCvDocx } from "./docx-render.js";
import type { CoverLetterDocumentData } from "./letter-data.js";
import { CoverLetterDocument } from "./letter-document.js";
import { resolveCvOptions, type ResolvedCvOptions } from "./render-options.js";

/*
 * Rendu déterministe : mêmes données, même document. Seules les métadonnées
 * d'horodatage internes du PDF varient d'un rendu à l'autre ; le contenu et la
 * mise en page, eux, ne dépendent que des données reçues. Aucune IA ici.
 */

const renderPdf = (data: CvDocumentData, options: ResolvedCvOptions): Promise<Buffer> =>
  renderToBuffer(
    <CvDocument
      data={data}
      template={options.template}
      accentColor={options.accentColor}
      showPhoto={options.showPhoto}
      photoDataUrl={options.photoDataUrl}
    />,
  );

/** Compte les pages d'un PDF rendu, pour borner le CV à une page A4. */
const pdfPageCount = async (buffer: Buffer): Promise<number> => {
  const { totalPages } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return totalPages;
};

/** Raccourcit un texte à un nombre de mots, sans casser la ponctuation finale. */
const trimWords = (text: string, maxWords: number): string => {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= maxWords) {
    return text;
  }
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}.`;
};

/*
 * Réduit progressivement le contenu quand la page déborde : on borne d'abord
 * les puces, puis les expériences, la formation, les compétences et enfin le
 * résumé. Le premier sacrifié est le contenu le plus détaillé, jamais l'identité.
 */
const shrinkCv = (data: CvDocumentData, level: number): CvDocumentData => {
  const experienceCap = Math.max(2, 4 - level);
  const bulletCap = Math.max(1, 4 - level);
  const educationCap = Math.max(1, 3 - level);
  const skillCap = Math.max(8, 25 - level * 4);
  const summaryWords = Math.max(25, 90 - level * 20);
  const projectCap = level >= 3 ? 0 : Math.max(1, 2 - level);

  return {
    ...data,
    summary: data.summary === undefined ? undefined : trimWords(data.summary, summaryWords),
    experiences: data.experiences.slice(0, experienceCap).map((experience) => ({
      ...experience,
      achievements: experience.achievements.slice(0, bulletCap),
    })),
    projects: data.projects.slice(0, projectCap),
    education: data.education.slice(0, educationCap),
    skills: data.skills.slice(0, skillCap),
  };
};

/*
 * Rend le CV en une page : si le premier rendu déborde, on rétrécit et on rend
 * à nouveau, jusqu'à tenir sur une page. Retourne le PDF et les données finales
 * retenues, afin que le DOCX affiche exactement le même contenu.
 */
const fitCvToOnePage = async (
  data: CvDocumentData,
  options: ResolvedCvOptions,
): Promise<{ pdf: Buffer; data: CvDocumentData }> => {
  let current = data;
  for (let level = 0; level < 4; level++) {
    const pdf = await renderPdf(current, options);
    const pages = await pdfPageCount(pdf);
    if (pages <= 1) {
      return { pdf, data: current };
    }
    current = shrinkCv(current, level + 1);
  }
  const final = shrinkCv(current, 4);
  const pdf = await renderPdf(final, options);
  return { pdf, data: final };
};

export const renderCvPdf = async (
  data: CvDocumentData,
  options?: CvRenderOptions,
): Promise<Buffer> => {
  const { pdf } = await fitCvToOnePage(data, resolveCvOptions(options));
  return pdf;
};

export const renderCvDocx = async (
  data: CvDocumentData,
  options?: CvRenderOptions,
): Promise<Buffer> => {
  const resolved = resolveCvOptions(options);
  const { data: finalData } = await fitCvToOnePage(data, resolved);
  return buildCvDocx(finalData, resolved);
};

export const renderCoverLetterPdf = async (
  data: CoverLetterDocumentData,
  options?: { accentColor?: string },
): Promise<Buffer> => {
  const accentColor = resolveAccentColor(options?.accentColor);
  return renderToBuffer(<CoverLetterDocument data={data} accentColor={accentColor} />);
};

export const renderCoverLetterDocx = async (
  data: CoverLetterDocumentData,
  options?: { accentColor?: string },
): Promise<Buffer> => {
  const accentColor = resolveAccentColor(options?.accentColor);
  return buildCoverLetterDocx(data, accentColor);
};
