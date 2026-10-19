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
 * La fenêtre par défaut est de cinq jours (choix du propriétaire). « 24 heures »
 * reste un resserrement possible. Aucune valeur ne permet d'aller au-delà de
 * cinq jours : une offre plus ancienne n'est jamais exposée.
 */
export const jobQuerySchema = z.object({
  freshness: z.enum(["LAST_24H", "LAST_5D"]).default("LAST_5D"),
  /*
   * Sans filtre, le flux s'en tient au défaut de `@findit/shared` : les
   * alternances des métiers du développement. `role=DATA_ANALYST` ou
   * `contract=INTERNSHIP` restent servis - ils sont dans le périmètre, ils ne
   * sont simplement pas montrés d'office.
   */
  role: z.enum(JOB_ROLE_CATEGORIES).optional(),
  contract: z.enum(JOB_CONTRACTS).optional(),
  department: z.enum(ILE_DE_FRANCE_DEPARTMENTS).optional(),
  workMode: z.enum(JOB_WORK_MODES).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  /// Niveau d'études demandé, tel que la source l'a écrit (ex. « Bac+5 »).
  studyLevel: z.string().trim().min(1).max(80).optional(),
  /// Recherche plein texte sur le titre, l'entreprise et la description.
  q: z.string().trim().min(2).max(120).optional(),
  /// Recherche sur le seul titre de l'offre.
  title: z.string().trim().min(2).max(120).optional(),
  /// Recherche sur le seul nom de l'entreprise.
  company: z.string().trim().min(2).max(120).optional(),
  /// N'expose que les offres dont la source privilégiée est l'entreprise.
  officialOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  /// Salaire annuel minimal, en euros : ne garde que les offres dont le salaire
  /// minimum déclaré atteint ce seuil. Ignoré quand l'offre ne le précise pas.
  salaryMin: z.coerce.number().int().min(0).max(10_000_000).optional(),
  /// Salaire annuel maximal, en euros : écarte les offres dont le salaire
  /// minimum déclaré dépasse ce plafond.
  salaryMax: z.coerce.number().int().min(0).max(10_000_000).optional(),
  sort: z.enum(["DATE", "QUALITY", "SALARY"]).default("DATE"),
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
