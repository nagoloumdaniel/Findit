import { parseWebEnv } from "@findit/config";
import { cookies } from "next/headers";

import { fetchProfile } from "./profile-api";

/*
 * Session côté web, serveur uniquement. Le jeton de session est conservé dans
 * un cookie HttpOnly (`findit_session`) ; l'identité d'affichage (nom, email,
 * rôle) dans un cookie lisible par le client (`findit_user`). Aucun secret ne
 * sort côté navigateur au-delà du strict nécessaire à l'affichage.
 */

const SESSION_COOKIE = "findit_session";
const USER_COOKIE = "findit_user";

/** Identité affichée en haut à droite, ou `null` quand personne n'est connecté. */
export type SessionUser = {
  id: string;
  email: string;
  role: string;
  /** Nom affiché (prénom/nom du profil), absent tant qu'il n'est pas renseigné. */
  name?: string;
};

const apiUrl = (): string => parseWebEnv(process.env).NEXT_PUBLIC_API_URL;

/** Lit la session depuis les cookies. */
export const getSessionUser = async (): Promise<SessionUser | null> => {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (raw === undefined) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    return typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
};

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; reason: string };

/** Appelle l'API de connexion et pose les cookies de session. */
export const login = async (email: string, password: string): Promise<LoginResult> => {
  try {
    const response = await fetch(new URL("/api/auth/login", apiUrl()), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { ok: false, reason: "Email ou mot de passe invalide." };
    }

    const body = (await response.json()) as { token: string; user: SessionUser };
    // Le nom affiché vient du profil, pas du compte : on le relit pour que la
    // barre montre le prénom/nom renseigné plutôt que l'email.
    const profile = await fetchProfile();
    const user: SessionUser = {
      ...body.user,
      ...(profile.fullName.trim() === "" ? {} : { name: profile.fullName }),
    };
    const store = await cookies();
    store.set(SESSION_COOKIE, body.token, { httpOnly: true, sameSite: "lax", path: "/" });
    store.set(USER_COOKIE, JSON.stringify(user), { sameSite: "lax", path: "/" });
    return { ok: true, user };
  } catch {
    return { ok: false, reason: "L’API est injoignable : connexion impossible." };
  }
};

/** Lit le jeton de session (pour appeler l'API avec l'identité). */
export const getSessionToken = async (): Promise<string | null> =>
  (await cookies()).get(SESSION_COOKIE)?.value ?? null;
