import { parseWebEnv } from "@findit/config";

/*
 * Accès au classement par correspondance, côté serveur uniquement.
 *
 * Même règle que `profile-api.ts` : ces appels portent `INTERNAL_API_KEY`, qui ne
 * doit jamais apparaître dans un bundle client. Ce module n'est donc importé que
 * par des composants serveur.
 */

/** Une offre classée par correspondance au profil, telle que l'API la rend. */
export type RankedItem = {
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  city: string;
  contractType: string;
  publishedAt: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  confidence: number;
  insufficientDataWarning: string | null;
};

const apiUrl = (): string => parseWebEnv(process.env).NEXT_PUBLIC_API_URL;

const internalKey = (): string | undefined => parseWebEnv(process.env).INTERNAL_API_KEY;

/** Vrai quand le classement par profil est possible : la clé interne existe. */
export const isMatchConfigured = (): boolean => internalKey() !== undefined;

/**
 * Classe les offres par correspondance au profil. Rend une liste vide plutôt
 * qu'une erreur : sans clé ou sans API, la recherche classique reste disponible,
 * et la page dit que le mode n'est pas configuré au lieu de crier.
 */
export const fetchRanked = async (freshness: string): Promise<RankedItem[]> => {
  const key = internalKey();
  if (key === undefined) {
    return [];
  }

  try {
    const response = await fetch(
      new URL(`/api/matching/rank?freshness=${encodeURIComponent(freshness)}`, apiUrl()),
      {
        cache: "no-store",
        headers: { accept: "application/json", "x-internal-key": key },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as RankedItem[];
  } catch {
    return [];
  }
};
