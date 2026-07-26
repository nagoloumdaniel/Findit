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
  })
  .strict();
export type GeneratedLetter = z.infer<typeof generatedLetterSchema>;
