import { z } from "zod";

const shortText = z.string().trim().min(1).max(200);
const mediumText = z.string().trim().min(1).max(1000);
const longText = z.string().trim().min(1).max(4000);
/*
 * Une « date » de CV est parfois une phrase lue telle quelle - « admission
 * prévue, rentrée 2026 » - et la recopier est plus fidèle que la refuser.
 * Constaté sur un CV réel : 40 caractères rejetaient toute l'extraction.
 */
const dateText = z.string().trim().min(1).max(120);
/*
 * Les CV écrivent leurs liens sans protocole (« github.com/x/y ») : exiger
 * une URL complète rejetait des faits exacts. On accepte la forme écrite dans
 * le document - domaine plausible, sans espace - sans la réécrire.
 */
const urlText = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i, "URL invalide");

const skillCategorySchema = z.enum([
  "programming_language",
  "framework",
  "database",
  "cloud_tool",
  "dev_tool",
  "soft_skill",
  "language",
  "other",
]);

const identitySchema = z
  .object({
    fullName: shortText.optional(),
    email: z.string().trim().email().max(200).optional(),
    phone: shortText.optional(),
    location: shortText.optional(),
    title: shortText.optional(),
    availability: shortText.optional(),
  })
  .strict();

const educationSchema = z
  .object({
    school: shortText.optional(),
    degree: shortText.optional(),
    field: shortText.optional(),
    location: shortText.optional(),
    startDate: dateText.optional(),
    endDate: dateText.optional(),
    description: mediumText.optional(),
  })
  .strict();

const experienceSchema = z
  .object({
    title: shortText.optional(),
    company: shortText.optional(),
    location: shortText.optional(),
    startDate: dateText.optional(),
    endDate: dateText.optional(),
    description: longText.optional(),
    achievements: z.array(mediumText).max(20).default([]),
    skills: z.array(shortText).max(40).default([]),
  })
  .strict();

const projectSchema = z
  .object({
    name: shortText.optional(),
    description: longText.optional(),
    url: urlText.optional(),
    skills: z.array(shortText).max(40).default([]),
  })
  .strict();

const skillSchema = z
  .object({
    name: shortText,
    category: skillCategorySchema.optional(),
    evidence: mediumText.optional(),
  })
  .strict();

const languageSchema = z
  .object({
    name: shortText,
    level: shortText.optional(),
  })
  .strict();

const certificationSchema = z
  .object({
    name: shortText,
    issuer: shortText.optional(),
    date: dateText.optional(),
  })
  .strict();

const linkSchema = z
  .object({
    label: shortText,
    url: urlText,
  })
  .strict();

export const resumeFactsSchema = z
  .object({
    // Requis, champs internes optionnels : constaté sur le modèle réel, un
    // objet optionnel est simplement sauté par la grammaire de décodage et
    // l'identité pourtant lisible n'était jamais extraite. Le rendre requis
    // force le modèle à au moins ouvrir l'objet ; ce qu'il ne voit pas dans le
    // CV reste omis champ par champ.
    identity: identitySchema,
    summary: longText.optional(),
    education: z.array(educationSchema).max(20).default([]),
    experiences: z.array(experienceSchema).max(30).default([]),
    projects: z.array(projectSchema).max(30).default([]),
    skills: z.array(skillSchema).max(120).default([]),
    languages: z.array(languageSchema).max(20).default([]),
    certifications: z.array(certificationSchema).max(30).default([]),
    links: z.array(linkSchema).max(20).default([]),
  })
  .strict();

export const structuredResumeSchema = z
  .object({
    facts: resumeFactsSchema,
    warnings: z.array(mediumText).max(30).default([]),
    confidence: z.number().int().min(0).max(100),
  })
  .strict();

export type ResumeFacts = z.infer<typeof resumeFactsSchema>;
export type StructuredResume = z.infer<typeof structuredResumeSchema>;

/*
 * Garde-fou anti-invention sur les dates, constaté nécessaire sur le modèle
 * réel : « 2025 » dans le CV devenait « 2025-01-01 » - une précision que la
 * source n'a jamais écrite. Règle déterministe : une date n'est gardée que si
 * le CV l'écrit (chaîne exacte, ou tous ses mots présents) ; sinon elle est
 * réduite à l'année réellement écrite ; sinon retirée. Chaque correction
 * laisse un avertissement - rien ne se répare en silence.
 */
const normalizeForSearch = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasToken = (source: string, token: string): boolean =>
  new RegExp(`(?<![a-z0-9])${escapeRegExp(token)}(?![a-z0-9])`, "u").test(source);

const dateAsRead = (value: string, source: string): string | null => {
  const normalized = normalizeForSearch(value);
  if (source.includes(normalized)) {
    return value;
  }
  const tokens = normalized.split(/[^a-z0-9]+/u).filter((token) => token.length > 0);
  if (tokens.length > 0 && tokens.every((token) => hasToken(source, token))) {
    return value;
  }
  const year = /(?:19|20)\d{2}/u.exec(normalized)?.[0];
  if (year !== undefined && hasToken(source, year)) {
    return year;
  }
  return null;
};

export const sanitizeDatesAgainstSource = (
  facts: ResumeFacts,
  sourceText: string,
): { facts: ResumeFacts; warnings: string[] } => {
  const source = normalizeForSearch(sourceText);
  const warnings: string[] = [];

  const fix = (value: string | undefined, label: string): string | undefined => {
    if (value === undefined) {
      return undefined;
    }
    const kept = dateAsRead(value, source);
    if (kept === value) {
      return value;
    }
    if (kept === null) {
      warnings.push(`Date retirée, absente du CV : « ${value} » (${label}).`);
      return undefined;
    }
    warnings.push(
      `Date ramenée à ce que le CV écrit : « ${value} » devient « ${kept} » (${label}).`,
    );
    return kept;
  };

  const fixRange = <T extends { startDate?: string | undefined; endDate?: string | undefined }>(
    entry: T,
    label: string,
  ): T => {
    const copy = { ...entry };
    const start = fix(copy.startDate, label);
    if (start === undefined) {
      delete copy.startDate;
    } else {
      copy.startDate = start;
    }
    const end = fix(copy.endDate, label);
    if (end === undefined) {
      delete copy.endDate;
    } else {
      copy.endDate = end;
    }
    return copy;
  };

  return {
    facts: {
      ...facts,
      experiences: facts.experiences.map((entry, index) =>
        fixRange(entry, `expérience ${String(index + 1)}`),
      ),
      education: facts.education.map((entry, index) =>
        fixRange(entry, `formation ${String(index + 1)}`),
      ),
      certifications: facts.certifications.map((entry, index) => {
        const copy = { ...entry };
        const date = fix(copy.date, `certification ${String(index + 1)}`);
        if (date === undefined) {
          delete copy.date;
        } else {
          copy.date = date;
        }
        return copy;
      }),
    },
    warnings,
  };
};
