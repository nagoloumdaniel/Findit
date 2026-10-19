import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import type { CvDocumentData, CvTemplate } from "./cv-data.js";
import { clean, period } from "./format.js";
import type { CoverLetterDocumentData } from "./letter-data.js";
import type { ResolvedCvOptions } from "./render-options.js";
import { groupSkills } from "./skills.js";

/*
 * Rendu DOCX du même contenu que le PDF : mêmes sections, même ordre, mêmes
 * textes. Tout est du vrai texte sélectionnable et structuré en paragraphes et
 * titres, sans tableau ni bloc flottant, pour rester lisible par un ATS. Les
 * tailles de police sont exprimées en demi-points (20 = 10 pt).
 */
const INK = "111827";
const MUTED = "4b5563";
const RULE = "d1d5db";

const hex = (color: string): string => color.replace("#", "");

/** Tailles (demi-points) et espacements propres à chaque modèle, en cohérence avec le PDF. */
type DocxTheme = {
  nameSize: number;
  headlineSize: number;
  contactSize: number;
  sectionSize: number;
  bodySize: number;
  entryTitleSize: number;
  sectionSpacing: number;
  entrySpacing: number;
};

const DOCX_THEMES: Record<CvTemplate, DocxTheme> = {
  classique: {
    nameSize: 40,
    headlineSize: 24,
    contactSize: 18,
    sectionSize: 22,
    bodySize: 20,
    entryTitleSize: 22,
    sectionSpacing: 160,
    entrySpacing: 120,
  },
  moderne: {
    nameSize: 44,
    headlineSize: 26,
    contactSize: 20,
    sectionSize: 24,
    bodySize: 22,
    entryTitleSize: 24,
    sectionSpacing: 240,
    entrySpacing: 200,
  },
  compact: {
    nameSize: 36,
    headlineSize: 22,
    contactSize: 16,
    sectionSize: 20,
    bodySize: 18,
    entryTitleSize: 20,
    sectionSpacing: 100,
    entrySpacing: 60,
  },
};

const sectionHeading = (text: string, accent: string, theme: DocxTheme): Paragraph =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: theme.sectionSpacing, after: 40 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 2 } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, color: accent, size: theme.sectionSize }),
    ],
  });

const bodyParagraph = (text: string, theme: DocxTheme, options?: { muted?: boolean }): Paragraph =>
  new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({
        text,
        size: theme.bodySize,
        color: options?.muted === true ? MUTED : INK,
      }),
    ],
  });

const bulletParagraph = (text: string, theme: DocxTheme): Paragraph =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 20 },
    children: [new TextRun({ text, size: theme.bodySize, color: INK })],
  });

type PhotoData = { type: "jpg" | "png"; data: Buffer };

/** Extrait le type et les octets d'une data URL PNG/JPEG ; null si illisible. */
const parsePhoto = (dataUrl: string): PhotoData | null => {
  const match = /^data:image\/(png|jpe?g);base64,(.*)$/s.exec(dataUrl);
  if (match === null) {
    return null;
  }
  const type: "jpg" | "png" = match[1] === "png" ? "png" : "jpg";
  const base64 = match[2] ?? "";
  return { type, data: Buffer.from(base64, "base64") };
};

export const buildCvDocx = (data: CvDocumentData, options: ResolvedCvOptions): Promise<Buffer> => {
  const accent = hex(options.accentColor);
  const theme = DOCX_THEMES[options.template];
  const children: Paragraph[] = [];

  if (data.identity !== undefined) {
    const identity = data.identity;
    if (identity.fullName !== undefined) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 40 },
          children: [new TextRun({ text: identity.fullName, bold: true, size: theme.nameSize, color: INK })],
        }),
      );
    }
    if (identity.title !== undefined) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: identity.title, bold: true, size: theme.headlineSize, color: accent }),
          ],
        }),
      );
    }
    const contact = clean([identity.location, identity.phone, identity.availability]);
    const contactParts = identity.email !== undefined ? [...contact, identity.email] : contact;
    if (contactParts.length > 0) {
      children.push(bodyParagraph(contactParts.join("  ·  "), theme, { muted: true }));
    }
    if (data.links.length > 0) {
      children.push(bodyParagraph(data.links.map((link) => link.url).join("  ·  "), theme));
    }
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: accent, space: 1 } },
      }),
    );
  }

  if (options.showPhoto && options.photoDataUrl !== null) {
    const photo = parsePhoto(options.photoDataUrl);
    if (photo !== null) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new ImageRun({
              type: photo.type,
              data: photo.data,
              transformation: { width: 64, height: 64 },
            }),
          ],
        }),
      );
    }
  }

  if (data.summary !== undefined) {
    children.push(sectionHeading("Profil", accent, theme));
    children.push(bodyParagraph(data.summary, theme));
  }

  if (data.skills.length > 0) {
    children.push(sectionHeading("Compétences", accent, theme));
    const groups = groupSkills(data.skills);
    if (groups === null) {
      children.push(bodyParagraph(data.skills.map((skill) => skill.name).join("  ·  "), theme));
    } else {
      for (const group of groups) {
        children.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: `${group.label}: `, bold: true, size: theme.bodySize, color: INK }),
              new TextRun({ text: group.names.join(", "), size: theme.bodySize, color: INK }),
            ],
          }),
        );
      }
    }
  }

  if (data.experiences.length > 0) {
    children.push(sectionHeading("Expériences", accent, theme));
    for (const experience of data.experiences) {
      const heading = clean([experience.title, experience.company]).join(" - ");
      const dates = period(experience.startDate, experience.endDate);
      const headingText = dates !== null ? `${heading}  (${dates})` : heading;
      if (headingText !== "") {
        children.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: headingText, bold: true, size: theme.entryTitleSize, color: INK }),
            ],
          }),
        );
      }
      if (experience.location !== undefined) {
        children.push(bodyParagraph(experience.location, theme, { muted: true }));
      }
      if (experience.description !== undefined) {
        children.push(bodyParagraph(experience.description, theme));
      }
      for (const achievement of experience.achievements) {
        children.push(bulletParagraph(achievement, theme));
      }
      if (experience.skills.length > 0) {
        children.push(bodyParagraph(experience.skills.join(" · "), theme, { muted: true }));
      }
      children.push(new Paragraph({ spacing: { after: theme.entrySpacing } }));
    }
  }

  if (data.projects.length > 0) {
    children.push(sectionHeading("Projets", accent, theme));
    for (const project of data.projects) {
      if (project.name !== undefined) {
        children.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: project.name, bold: true, size: theme.entryTitleSize, color: INK }),
            ],
          }),
        );
      }
      if (project.description !== undefined) {
        children.push(bodyParagraph(project.description, theme));
      }
      if (project.url !== undefined) {
        children.push(bodyParagraph(project.url, theme));
      }
      if (project.skills.length > 0) {
        children.push(bodyParagraph(project.skills.join(" · "), theme, { muted: true }));
      }
      children.push(new Paragraph({ spacing: { after: theme.entrySpacing } }));
    }
  }

  if (data.education.length > 0) {
    children.push(sectionHeading("Formation", accent, theme));
    for (const education of data.education) {
      const heading = clean([education.degree, education.field]).join(" - ");
      const dates = period(education.startDate, education.endDate);
      const place = clean([education.school, education.location]).join(", ");
      const title = heading !== "" ? heading : place;
      const titleWithDates = dates !== null ? `${title}  (${dates})` : title;
      if (titleWithDates !== "") {
        children.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: titleWithDates, bold: true, size: theme.entryTitleSize, color: INK }),
            ],
          }),
        );
      }
      if (heading !== "" && place !== "") {
        children.push(bodyParagraph(place, theme, { muted: true }));
      }
      if (education.description !== undefined) {
        children.push(bodyParagraph(education.description, theme));
      }
      children.push(new Paragraph({ spacing: { after: theme.entrySpacing } }));
    }
  }

  if (data.languages.length > 0) {
    children.push(sectionHeading("Langues", accent, theme));
    children.push(
      bodyParagraph(
        data.languages
          .map((language) =>
            language.level === undefined ? language.name : `${language.name} (${language.level})`,
          )
          .join("  ·  "),
        theme,
      ),
    );
  }

  if (data.certifications.length > 0) {
    children.push(sectionHeading("Certifications", accent, theme));
    for (const certification of data.certifications) {
      children.push(
        bodyParagraph(
          clean([certification.name, certification.issuer, certification.date]).join(" - "),
          theme,
        ),
      );
    }
  }

  const document = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(document);
};

export const buildCoverLetterDocx = (
  data: CoverLetterDocumentData,
  accentColor: string,
): Promise<Buffer> => {
  const accent = hex(accentColor);
  const children: Paragraph[] = [];

  if (data.senderName !== undefined) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: data.senderName, bold: true, size: 26, color: accent })],
      }),
    );
  }
  for (const line of data.senderContact) {
    children.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: line, size: 18, color: MUTED })],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200, after: 20 },
      children: [new TextRun({ text: data.companyName, size: 21, color: INK })],
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80 },
      children: [new TextRun({ text: `Candidature : ${data.jobTitle}`, size: 21, color: INK })],
    }),
  );

  if (data.cityAndDate !== undefined) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 120 },
        children: [new TextRun({ text: data.cityAndDate, size: 21, color: INK })],
      }),
    );
  }

  children.push(
    new Paragraph({
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: hex("#d1d5db"), space: 4 } },
      children: [new TextRun({ text: `Objet : ${data.subject}`, bold: true, size: 22, color: accent })],
    }),
  );

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text: "Madame, Monsieur,", size: 21, color: INK })],
    }),
  );

  for (const paragraph of data.paragraphs) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: paragraph, size: 21, color: INK })],
      }),
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({
          text: "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
          size: 21,
          color: INK,
        }),
      ],
    }),
  );

  if (data.senderName !== undefined) {
    children.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [new TextRun({ text: data.senderName, bold: true, size: 21, color: INK })],
      }),
    );
  }

  const document = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(document);
};
