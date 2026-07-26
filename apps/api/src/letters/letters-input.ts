import { z } from "zod";

/*
 * L'identifiant de CV est un UUID et le slug d'offre garde la forme stricte de
 * la liste publique : aucune autre valeur d'URL ne part vers la base.
 */
export const letterParamsSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
});
export type LetterParams = z.infer<typeof letterParamsSchema>;

export const letterListParamsSchema = z.object({
  id: z.string().uuid(),
});
export type LetterListParams = z.infer<typeof letterListParamsSchema>;

/*
 * Sortie attendue du modèle local. Les bornes basses refusent le trop vague :
 * une lettre de deux lignes ou un objet de trois mots ne passent pas. Les
 * formules d'adresse et de politesse n'en font pas partie : elles
 * appartiennent au modèle de document.
 */
export const generatedLetterSchema = z
  .object({
    subject: z.string().trim().min(15).max(200),
    paragraphs: z.array(z.string().trim().min(60).max(1200)).min(2).max(5),
    usedFacts: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    warnings: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
    /// Pour chaque compétence en cours d'acquisition : les notions concrètes
    /// à apprendre, en rapport avec l'offre.
    learningNotes: z
      .array(
        z
          .object({
            skill: z.string().trim().min(1).max(100),
            notions: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();
export type GeneratedLetter = z.infer<typeof generatedLetterSchema>;

/*
 * Ajouts décidés par le propriétaire via la popup de tri : une compétence
 * absente du CV n'entre dans la lettre que par sa décision explicite -
 * possédée (citable comme acquise) ou en cours d'acquisition (jamais
 * présentée comme acquise). Rien n'est jamais ajouté en silence.
 */
export const letterAdditionsSchema = z
  .object({
    additions: z
      .array(
        z
          .object({
            skill: z.string().trim().min(1).max(100),
            status: z.enum(["possessed", "learning"]),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
  .optional();
export type LetterAdditions = z.infer<typeof letterAdditionsSchema>;
