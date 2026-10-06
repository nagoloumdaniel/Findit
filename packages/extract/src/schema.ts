import { z } from "zod";

/**
 * Schéma de ce que le modèle doit produire pour une offre, avant enrichissement.
 *
 * Les champs facultatifs doivent rester absents quand la page ne les fournit
 * pas : c'est ce qui distingue une donnée vraie d'une donnée inventée. On ne
 * réclame donc ni valeur par défaut ni chaîne vide. `title` et `company` sont
 * des chaînes libres (même vides) : une valeur vide n'est pas une violation de
 * schéma, elle est signalée plus tard par le score de validation.
 *
 * `applicationUrl` est facultatif ici : le modèle ne la renseigne que quand la
 * page pointe vers une URL de candidature distincte de la page elle-même. À
 * l'enrichissement, on retombe sur l'URL de la page.
 */
export const extractedOfferSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  contractType: z.string().optional(),
  description: z.string().optional(),
  technologies: z.array(z.string()),
  salary: z.string().optional(),
  publishedAt: z.string().optional(),
  applicationUrl: z.string().optional(),
});

export type ExtractedOffer = z.infer<typeof extractedOfferSchema>;

/** La réponse attendue du modèle : une liste, éventuellement vide, d'offres. */
export const extractionResponseSchema = z.object({
  offers: z.array(extractedOfferSchema),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

/**
 * Offre d'emploi structurée, enrichie des métadonnées de la page d'origine.
 * C'est le « JobOffer » du cahier des charges (section 8), limité aux champs
 * que l'extraction est capable de produire sans inventer. `sourceUrl` et
 * `sourceDomain` ne viennent jamais du modèle : ils sont déduits de la page.
 */
export const jobOfferSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  contractType: z.string().optional(),
  description: z.string().optional(),
  technologies: z.array(z.string()),
  salary: z.string().optional(),
  publishedAt: z.string().optional(),
  applicationUrl: z.string(),
  sourceUrl: z.string(),
  sourceDomain: z.string(),
});

export type JobOffer = z.infer<typeof jobOfferSchema>;
