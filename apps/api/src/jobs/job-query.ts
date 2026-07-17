import {
  ILE_DE_FRANCE_DEPARTMENTS,
  JOB_CONTRACTS,
  JOB_ROLE_CATEGORIES,
  JOB_WORK_MODES,
} from "@findit/shared";
import { z } from "zod";

/*
 * Les valeurs acceptées viennent toutes de `@findit/shared` : le périmètre est
 * défini une seule fois et l'API ne peut pas s'en écarter silencieusement.
 *
 * La fenêtre par défaut est de 24 heures. Aucune valeur ne permet d'aller
 * au-delà de 72 heures : une offre plus ancienne n'est jamais exposée.
 */
export const jobQuerySchema = z.object({
  freshness: z.enum(["LAST_24H", "LAST_72H"]).default("LAST_24H"),
  role: z.enum(JOB_ROLE_CATEGORIES).optional(),
  contract: z.enum(JOB_CONTRACTS).optional(),
  department: z.enum(ILE_DE_FRANCE_DEPARTMENTS).optional(),
  workMode: z.enum(JOB_WORK_MODES).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  /// Recherche plein texte sur le titre, l'entreprise et la description.
  q: z.string().trim().min(2).max(120).optional(),
  /// N'expose que les offres dont la source privilégiée est l'entreprise.
  officialOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sort: z.enum(["DATE", "QUALITY"]).default("DATE"),
  page: z.coerce.number().int().min(1).default(1),
  /// Plafonné pour qu'une requête ne puisse pas demander la base entière.
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type JobQuery = z.infer<typeof jobQuerySchema>;

/// Pour les routes qui n'acceptent que la fenêtre de fraîcheur.
export const freshnessQuerySchema = jobQuerySchema.pick({ freshness: true });
export type FreshnessQuery = z.infer<typeof freshnessQuerySchema>;

/*
 * Un slug est composé de minuscules, de chiffres et de tirets. Le motif est
 * strict pour qu'aucune valeur d'URL ne parte vers la base sans forme connue.
 */
export const jobSlugSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
});
export type JobSlug = z.infer<typeof jobSlugSchema>;
