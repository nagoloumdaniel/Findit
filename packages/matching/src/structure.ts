import { z } from "zod";

import type { DeepSeekModel } from "@findit/ai";

import type { StructuredCv } from "./types.js";

/**
 * Schéma de sortie exigé du modèle.
 *
 * Le POURQUOI : `generateStructured` revalide ce schéma après coup. Un champ
 * absent reste une liste vide, jamais une invention.
 */
const StructuredCvSchema = z.object({
  identity: z.string(),
  experiences: z.array(z.string()),
  projects: z.array(z.string()),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  certifications: z.array(z.string()),
});

/**
 * Consigne système.
 *
 * Le POURQUOI : la structuration ne doit rien inventer. Tout ce qui ne figure
 * pas explicitement dans le CV reste absent ; les compétences sont des chaînes
 * courtes, pas des phrases.
 */
const SYSTEM_PROMPT =
  "Tu extrais les faits d'un CV en JSON. Règles impératives : n'invente rien, " +
  "un fait absent reste un champ vide ou une liste vide ; `skills` est une liste " +
  "de compétences courtes (ex. « React », « Node.js ») ; chaque expérience, " +
  "projet, langue et certification est une chaîne de texte libre.";

/**
 * Structure un CV brut en faits exploitables pour le matching.
 *
 * Le POURQUOI : le matching compare des faits structurés à une offre, jamais le
 * texte brut. Cette étape est distincte du score pour pouvoir structurer une
 * fois puis scorer contre plusieurs offres.
 */
export const structureCv = async (cvText: string, model: DeepSeekModel): Promise<StructuredCv> => {
  const output = await model.generateStructured<StructuredCv>({
    schema: StructuredCvSchema,
    system: SYSTEM_PROMPT,
    prompt: cvText,
  });

  return output;
};
