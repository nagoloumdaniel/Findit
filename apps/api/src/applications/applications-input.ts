import { z } from "zod";

export const applicationStatusSchema = z.enum([
  "TO_APPLY",
  "APPLIED",
  "INTERVIEW",
  "OFFER_RECEIVED",
  "REJECTED",
  "WITHDRAWN",
]);

/*
 * Créer un dossier part d'une offre ; le CV est optionnel et ne sert qu'à
 * photographier le score et la lettre existants au moment de candidater.
 */
export const createApplicationSchema = z
  .object({
    jobSlug: z
      .string()
      .min(1)
      .max(140)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
    resumeId: z.string().uuid().optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/// Changer le statut ou les notes ; tout changement de statut s'historise.
export const updateApplicationSchema = z
  .object({
    status: applicationStatusSchema.optional(),
    notes: z.string().trim().max(2000).optional(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.notes !== undefined, {
    message: "Rien à mettre à jour : fournir status ou notes.",
  });
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const applicationIdSchema = z.object({ id: z.string().uuid() });
export type ApplicationIdParam = z.infer<typeof applicationIdSchema>;
