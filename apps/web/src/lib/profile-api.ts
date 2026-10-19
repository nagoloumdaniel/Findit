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

/** Une formation : école, diplôme, domaine et période. */
export type ProfileEducation = {
  school: string;
  degree: string;
  field: string;
  startDate?: string;
  endDate?: string;
  description?: string;
};

/** Une certification, avec organisme et date facultatives. */
export type ProfileCertification = {
  name: string;
  issuer?: string;
  date?: string;
};

/** Un projet, avec son rôle et ses compétences. */
export type ProfileProject = {
  name: string;
  role?: string;
  description?: string;
  url?: string;
  skills: string[];
};

/** Un contrat recherché, sous-ensemble des six catégories de la plateforme. */
export type ProfileContractPreference =
  "ALTERNANCE" | "INTERNSHIP" | "CDI" | "CDD" | "INTERIM" | "STUDENT_JOB";

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
  education: ProfileEducation[];
  certifications: ProfileCertification[];
  projects: ProfileProject[];
  preferredContracts: ProfileContractPreference[];
  targetRoles: string[];
  targetSectors: string[];
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
  education: [],
  certifications: [],
  projects: [],
  preferredContracts: [],
  targetRoles: [],
  targetSectors: [],
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

/** Un modèle de mise en page de CV, aligné sur l'API. */
export type CvTemplate = "classique" | "moderne" | "compact";

/** Corps de `POST /api/documents/cv`. */
export type CvDocumentRequest = {
  jobSlug: string;
  template?: CvTemplate;
  showPhoto?: boolean;
  photoDataUrl?: string | null;
  accentColor?: string;
  format?: "pdf" | "docx";
};

/** Corps de `POST /api/documents/letter`. */
export type LetterDocumentRequest = {
  jobSlug: string;
  accentColor?: string;
  format?: "pdf" | "docx";
};

/** Fichier généré, renvoyé en base64 pour être téléchargé côté client. */
export type GeneratedDocument = {
  fileName: string;
  contentType: string;
  contentBase64: string;
};

export type DocumentResult = { ok: true; data: GeneratedDocument } | { ok: false; reason: string };

/** Extrait le nom de fichier de l'en-tête `Content-Disposition`, avec repli. */
const fileNameFromDisposition = (value: string | null, fallback: string): string => {
  if (value === null) {
    return fallback;
  }
  const match = /filename="?([^";]+)"?/iu.exec(value);
  return match?.[1] ?? fallback;
};

/*
 * Appelle une route de documents et renvoie le fichier en base64. La clé
 * interne reste ici, côté serveur : le navigateur ne la voit jamais.
 */
const fetchDocument = async (path: string, body: unknown): Promise<DocumentResult> => {
  const key = internalKey();
  if (key === undefined) {
    return { ok: false, reason: "Espace personnel non configuré : INTERNAL_API_KEY manquante." };
  }

  try {
    const response = await fetch(new URL(path, apiUrl()), {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return { ok: false, reason: `L’API a refusé la génération (${String(response.status)}).` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: true,
      data: {
        fileName: fileNameFromDisposition(response.headers.get("content-disposition"), "document"),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        contentBase64: buffer.toString("base64"),
      },
    };
  } catch {
    return { ok: false, reason: "L’API est injoignable : rien n’a été généré." };
  }
};

/** Génère le CV du profil pour une offre. */
export const generateCvDocument = (request: CvDocumentRequest): Promise<DocumentResult> =>
  fetchDocument("/api/documents/cv", request);

/** Génère la lettre de motivation pour une offre. */
export const generateLetterDocument = (request: LetterDocumentRequest): Promise<DocumentResult> =>
  fetchDocument("/api/documents/letter", request);

/** Score explicable du CV du profil contre une offre, tel que l'API le rend. */
export type CvScore = {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
  confidence: number;
  insufficientDataWarning: string | null;
};

export type ScoreResult = { ok: true; data: CvScore } | { ok: false; reason: string };

/**
 * Lit le score du CV du profil contre une offre. Déterministe, sans appel IA :
 * il dit quelles compétences exigées sont couvertes et lesquelles manquent.
 */
export const scoreCvDocument = async (jobSlug: string): Promise<ScoreResult> => {
  const key = internalKey();
  if (key === undefined) {
    return { ok: false, reason: "Espace personnel non configuré : INTERNAL_API_KEY manquante." };
  }

  try {
    const response = await fetch(new URL("/api/documents/cv/score", apiUrl()), {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": key },
      body: JSON.stringify({ jobSlug }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { ok: false, reason: `L’API a refusé le score (${String(response.status)}).` };
    }

    return { ok: true, data: (await response.json()) as CvScore };
  } catch {
    return { ok: false, reason: "L’API est injoignable : le score n’est pas disponible." };
  }
};

/** Une offre en favori, telle que l'API la rend. */
export type FavoriteItem = {
  slug: string;
  title: string;
  companyName: string;
  city: string;
  contractType: string;
  favoritedAt: string;
};

/** Liste les favoris, ou une liste vide quand l'espace personnel n'est pas configuré. */
export const fetchFavorites = async (): Promise<FavoriteItem[]> => {
  const key = internalKey();
  if (key === undefined) {
    return [];
  }
  try {
    const response = await fetch(new URL("/api/favorites", apiUrl()), {
      cache: "no-store",
      headers: { accept: "application/json", "x-internal-key": key },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as FavoriteItem[];
  } catch {
    return [];
  }
};

export type FavoriteToggleResult = { ok: true; favorited: boolean } | { ok: false; reason: string };

/** Ajoute ou retire une offre des favoris, et dit l'état résultant. */
export const toggleFavorite = async (slug: string): Promise<FavoriteToggleResult> => {
  const key = internalKey();
  if (key === undefined) {
    return { ok: false, reason: "Espace personnel non configuré : INTERNAL_API_KEY manquante." };
  }
  try {
    const response = await fetch(new URL(`/api/favorites/${slug}/toggle`, apiUrl()), {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": key },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { ok: false, reason: `L’API a refusé le favori (${String(response.status)}).` };
    }
    const body = (await response.json()) as { favorited: boolean };
    return { ok: true, favorited: body.favorited };
  } catch {
    return { ok: false, reason: "L’API est injoignable : le favori n’a pas été modifié." };
  }
};
