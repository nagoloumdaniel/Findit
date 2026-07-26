/*
 * Client de l'espace privé, exécuté dans le navigateur. La clé est fournie à
 * chaque appel via l'en-tête `x-workspace-key` : elle ne vit ni dans le code
 * ni dans une adresse, et l'API la vérifie à temps constant.
 */

export type ResumeSummary = {
  id: string;
  fileType: string;
  originalFileName: string;
  fileSize: number;
  textLength: number;
  structuredAt: string | null;
  structuredConfidence: number | null;
  expiresAt: string;
  createdAt: string;
};

export type StructuredFacts = {
  identity: {
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    availability?: string;
  };
  summary?: string;
  skills: { name: string; category?: string }[];
  languages: { name: string; level?: string }[];
  experiences: { title?: string; company?: string }[];
  education: { school?: string; degree?: string }[];
};

export type ResumeDetail = ResumeSummary & {
  extractedText: string;
  structured: {
    facts: StructuredFacts;
    warnings: string[];
    confidence: number;
    structuredAt: string;
  } | null;
};

/*
 * L'échec porte le statut et le message de l'API : la page affiche la vraie
 * raison (clé refusée, CV illisible, IA indisponible…) au lieu d'un « oups ».
 */
export type WorkspaceResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string };

const baseUrl = (): string => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/*
 * Les appels privés passent par le proxy serveur `/api/ws/*` : la clé vit
 * côté serveur Next, jamais dans le navigateur. Le paramètre `key` des
 * fonctions est conservé pour la forme mais n'est plus envoyé.
 */
const toProxyPath = (path: string): string => path.replace(/^\/api\//, "/api/ws/");

const request = async <T>(
  _key: string,
  path: string,
  init?: RequestInit,
): Promise<WorkspaceResult<T>> => {
  try {
    const response = await fetch(toProxyPath(path), { ...init });

    if (!response.ok) {
      let message = `L'API a répondu ${String(response.status)}.`;
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string") {
          message = body.message;
        }
      } catch {
        // Corps non JSON : le statut suffit.
      }
      return { ok: false, status: response.status, message };
    }

    if (response.status === 204) {
      return { ok: true, data: undefined as T };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, message: "L'API est injoignable." };
  }
};

/** Valide la clé sans effet de bord : lister est inoffensif. */
export const checkWorkspaceKey = (key: string): Promise<WorkspaceResult<ResumeSummary[]>> =>
  request<ResumeSummary[]>(key, "/api/resumes");

export const listResumes = (key: string): Promise<WorkspaceResult<ResumeSummary[]>> =>
  request<ResumeSummary[]>(key, "/api/resumes");

export const fetchResumeDetail = (
  key: string,
  id: string,
): Promise<WorkspaceResult<ResumeDetail>> => request<ResumeDetail>(key, `/api/resumes/${id}`);

export const uploadResume = (key: string, file: File): Promise<WorkspaceResult<ResumeDetail>> => {
  const body = new FormData();
  body.append("file", file);
  return request<ResumeDetail>(key, "/api/resumes/upload", { method: "POST", body });
};

/** Long : le modèle local met couramment une minute. Pas de délai imposé ici. */
export const structureResume = (key: string, id: string): Promise<WorkspaceResult<ResumeDetail>> =>
  request<ResumeDetail>(key, `/api/resumes/${id}/structure`, { method: "POST" });

export const removeResume = (key: string, id: string): Promise<WorkspaceResult<undefined>> =>
  request<undefined>(key, `/api/resumes/${id}`, { method: "DELETE" });

export type OfferSummary = {
  slug: string;
  title: string;
  companyName: string;
  city: string;
  contractType: string;
  isDemo: boolean;
};

export type MatchCriterion = {
  criterion: string;
  weight: number;
  rawScore: number;
  points: number;
  details: string[];
};

export type MatchView = {
  job: { slug: string; title: string; companyName: string };
  score: number;
  scoreBreakdown: MatchCriterion[];
  matchedSkills: string[];
  missingSkills: string[];
  missingKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  confidence: number;
  insufficientDataWarning: string | null;
  computedAt: string;
};

export type LetterView = {
  job: { slug: string; title: string; companyName: string };
  subject: string;
  paragraphs: string[];
  usedFacts: string[];
  warnings: string[];
  generatedAt: string;
};

/** Les offres publiées sont publiques : pas de clé, mêmes états d'erreur. */
export const fetchPublishedOffers = async (): Promise<WorkspaceResult<OfferSummary[]>> => {
  try {
    const response = await fetch(new URL("/api/jobs?freshness=LAST_72H", baseUrl()));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: "La liste des offres est indisponible.",
      };
    }
    const data = (await response.json()) as { items: OfferSummary[] };
    return { ok: true, data: data.items };
  } catch {
    return { ok: false, status: 0, message: "L'API est injoignable." };
  }
};

export const computeMatch = (
  key: string,
  resumeId: string,
  slug: string,
): Promise<WorkspaceResult<MatchView>> =>
  request<MatchView>(key, `/api/resumes/${resumeId}/matches/${slug}`, { method: "POST" });

/** « Faire matcher mon CV » : score contre toutes les offres publiées. */
export const computeAllMatches = (
  key: string,
  resumeId: string,
): Promise<WorkspaceResult<MatchView[]>> =>
  request<MatchView[]>(key, `/api/resumes/${resumeId}/matches`, { method: "POST" });

export const listMatches = (key: string, resumeId: string): Promise<WorkspaceResult<MatchView[]>> =>
  request<MatchView[]>(key, `/api/resumes/${resumeId}/matches`);

/** Long : le modèle local rédige en 30 à 60 s. Pas de délai imposé ici. */
export const generateLetter = (
  key: string,
  resumeId: string,
  slug: string,
): Promise<WorkspaceResult<LetterView>> =>
  request<LetterView>(key, `/api/resumes/${resumeId}/letters/${slug}`, { method: "POST" });

export const listLetters = (
  key: string,
  resumeId: string,
): Promise<WorkspaceResult<LetterView[]>> =>
  request<LetterView[]>(key, `/api/resumes/${resumeId}/letters`);

export type ApplicationEventView = {
  status: string;
  note: string | null;
  occurredAt: string;
};

export type ApplicationView = {
  id: string;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  jobStillExists: boolean;
  resumeFileName: string | null;
  matchScore: number | null;
  letterSubject: string | null;
  letterParagraphs: string[];
  status: string;
  notes: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: ApplicationEventView[];
};

export const createApplication = (
  key: string,
  input: { jobSlug: string; resumeId?: string },
): Promise<WorkspaceResult<ApplicationView>> =>
  request<ApplicationView>(key, "/api/applications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

export const listApplications = (key: string): Promise<WorkspaceResult<ApplicationView[]>> =>
  request<ApplicationView[]>(key, "/api/applications");

export const updateApplication = (
  key: string,
  id: string,
  input: { status?: string; note?: string; notes?: string },
): Promise<WorkspaceResult<ApplicationView>> =>
  request<ApplicationView>(key, `/api/applications/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

export const deleteApplication = (key: string, id: string): Promise<WorkspaceResult<undefined>> =>
  request<undefined>(key, `/api/applications/${id}`, { method: "DELETE" });

/*
 * Un lien ne peut pas porter l'en-tête de clé : le PDF se télécharge donc par
 * fetch, puis un lien temporaire vers le blob déclenche l'enregistrement.
 */
export const downloadPdf = async (
  _key: string,
  path: string,
  fallbackName: string,
): Promise<WorkspaceResult<undefined>> => {
  try {
    const response = await fetch(toProxyPath(path));
    if (!response.ok) {
      let message = `L'API a répondu ${String(response.status)}.`;
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string") {
          message = body.message;
        }
      } catch {
        // Corps non JSON : le statut suffit.
      }
      return { ok: false, status: response.status, message };
    }

    const disposition = response.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = match?.[1] ?? fallbackName;
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, status: 0, message: "L'API est injoignable." };
  }
};
