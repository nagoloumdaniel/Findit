import { parseWebEnv } from "@findit/config";

/*
 * Accès au profil personnel, côté serveur uniquement.
 *
 * Le POURQUOI d'un module séparé : ces appels portent `INTERNAL_API_KEY`, la clé
 * serveur à serveur. Elle ne doit jamais se retrouver dans un bundle client — donc
 * aucune page cliente n'importe ce fichier, et `lib/api.ts` (importé par des
 * composants) reste sans secret.
 */

/** Un lien affiché sur le profil : portfolio, GitHub, LinkedIn… */
export type ProfileLink = {
  label: string;
  url: string;
};

/** Une langue et son niveau, tels que la personne les décrit. */
export type ProfileLanguage = {
  name: string;
  level: string;
};

/** Une expérience : ce qu'un CV met en avant. */
export type ProfileExperience = {
  title: string;
  company: string;
  period: string;
  description: string;
};

export type Profile = {
  fullName: string;
  headline: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  links: ProfileLink[];
  skills: string[];
  languages: ProfileLanguage[];
  experiences: ProfileExperience[];
  cvText: string | null;
  updatedAt: string | null;
};

/** Profil vide : ce que la page affiche tant que rien n'a été enregistré. */
export const EMPTY_PROFILE: Profile = {
  fullName: "",
  headline: null,
  email: null,
  phone: null,
  city: null,
  links: [],
  skills: [],
  languages: [],
  experiences: [],
  cvText: null,
  updatedAt: null,
};

const apiUrl = (): string => parseWebEnv(process.env).NEXT_PUBLIC_API_URL;

const internalKey = (): string | undefined => parseWebEnv(process.env).INTERNAL_API_KEY;

/** Vrai quand l'espace personnel est configuré : sans clé, rien n'est appelable. */
export const isProfileConfigured = (): boolean => internalKey() !== undefined;

/**
 * Lit le profil. Rend un profil vide plutôt qu'une erreur : une page personnelle
 * qui n'affiche rien parce que la base est vide n'a pas à crier.
 */
export const fetchProfile = async (): Promise<Profile> => {
  const key = internalKey();
  if (key === undefined) {
    return EMPTY_PROFILE;
  }

  try {
    const response = await fetch(new URL("/api/profile", apiUrl()), {
      cache: "no-store",
      headers: { accept: "application/json", "x-internal-key": key },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return EMPTY_PROFILE;
    }

    return (await response.json()) as Profile;
  } catch {
    return EMPTY_PROFILE;
  }
};

/** Écrit le profil. Rend l'erreur telle quelle : l'appelant l'affiche. */
export const saveProfile = async (
  profile: Omit<Profile, "updatedAt">,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const key = internalKey();
  if (key === undefined) {
    return { ok: false, reason: "Espace personnel non configuré : INTERNAL_API_KEY manquante." };
  }

  try {
    const response = await fetch(new URL("/api/profile", apiUrl()), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-internal-key": key,
      },
      body: JSON.stringify(profile),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { ok: false, reason: `L’API a refusé l’enregistrement (${String(response.status)}).` };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "L’API est injoignable : rien n’a été enregistré." };
  }
};
