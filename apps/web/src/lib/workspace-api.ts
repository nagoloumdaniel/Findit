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

const request = async <T>(
  key: string,
  path: string,
  init?: RequestInit,
): Promise<WorkspaceResult<T>> => {
  try {
    const response = await fetch(new URL(path, baseUrl()), {
      ...init,
      headers: { ...(init?.headers ?? {}), "x-workspace-key": key },
    });

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

/*
 * Un lien ne peut pas porter l'en-tête de clé : le PDF se télécharge donc par
 * fetch, puis un lien temporaire vers le blob déclenche l'enregistrement.
 */
export const downloadPdf = async (
  key: string,
  path: string,
  fallbackName: string,
): Promise<WorkspaceResult<undefined>> => {
  try {
    const response = await fetch(new URL(path, baseUrl()), {
      headers: { "x-workspace-key": key },
    });
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
