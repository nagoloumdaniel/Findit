"use server";

import {
  generateCvDocument,
  generateLetterDocument,
  scoreCvDocument,
  toggleFavorite,
} from "../../../lib/profile-api";
import type {
  CvDocumentRequest,
  GeneratedDocument,
  LetterDocumentRequest,
} from "../../../lib/profile-api";
import type { FavoriteToggleResult, ScoreResult } from "../../../lib/profile-api";

/*
 * Génération de CV et de lettre depuis la page d'une offre.
 *
 * Le POURQUOI d'actions serveur : les routes de documents portent la clé
 * interne, jamais exposée au navigateur. Le composant client demande le
 * fichier, le serveur l'appelle et renvoie les octets en base64.
 */

export type DocumentActionResult =
  { ok: true; document: GeneratedDocument } | { ok: false; reason: string };

/** Génère le CV du profil pour l'offre et renvoie le fichier en base64. */
export const generateCvAction = async (
  request: CvDocumentRequest,
): Promise<DocumentActionResult> => {
  const result = await generateCvDocument(request);
  return result.ok ? { ok: true, document: result.data } : { ok: false, reason: result.reason };
};

/** Génère la lettre de motivation pour l'offre et renvoie le fichier en base64. */
export const generateLetterAction = async (
  request: LetterDocumentRequest,
): Promise<DocumentActionResult> => {
  const result = await generateLetterDocument(request);
  return result.ok ? { ok: true, document: result.data } : { ok: false, reason: result.reason };
};

/** Lit le score du CV du profil contre l'offre, sans générer de document. */
export async function scoreCvAction(jobSlug: string): Promise<ScoreResult> {
  return scoreCvDocument(jobSlug);
}

/** Ajoute ou retire l'offre des favoris. */
export async function toggleFavoriteAction(jobSlug: string): Promise<FavoriteToggleResult> {
  return toggleFavorite(jobSlug);
}
