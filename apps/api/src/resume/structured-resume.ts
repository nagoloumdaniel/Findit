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
