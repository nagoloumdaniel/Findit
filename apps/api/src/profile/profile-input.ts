import { z } from "zod";

/*
 * Ce qu'on accepte d'écrire dans le profil. Tout est facultatif à la mise à
 * jour : on ne remplace que ce qui est fourni. Les chaînes sont bornées pour
 * qu'aucune entrée démesurée n'atteigne la base.
 */
const shortText = z.string().trim().min(1).max(200);
const url = z.string().trim().url().max(500);

const language = z.object({
  name: shortText,
  level: z.string().trim().min(1).max(40).optional(),
});

export const profileInputSchema = z
  .object({
    fullName: shortText,
    email: z.string().trim().email().max(200).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    city: shortText.optional(),
    targetRoles: z.array(shortText).max(20).optional(),
    availability: shortText.optional(),
    studyProgram: shortText.optional(),
    school: shortText.optional(),
    workStudyRhythm: shortText.optional(),
    portfolioUrl: url.optional(),
    githubUrl: url.optional(),
    linkedinUrl: url.optional(),
    languages: z.array(language).max(20).optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ProfileInput = z.infer<typeof profileInputSchema>;

/// À la mise à jour, même le nom est facultatif : on ne touche qu'aux champs donnés.
export const profilePatchSchema = profileInputSchema.partial().strict();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
