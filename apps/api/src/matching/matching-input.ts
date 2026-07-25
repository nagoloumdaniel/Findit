import { z } from "zod";

/*
 * L'identifiant de CV est un UUID et le slug d'offre garde la forme stricte de
 * la liste publique : aucune autre valeur d'URL ne part vers la base.
 */
export const matchParamsSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
});
export type MatchParams = z.infer<typeof matchParamsSchema>;

export const matchListParamsSchema = z.object({
  id: z.string().uuid(),
});
export type MatchListParams = z.infer<typeof matchListParamsSchema>;
