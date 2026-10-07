import { NextResponse } from "next/server";

import { SESSION_COOKIE, createSessionToken } from "../../../lib/session";

/*
 * Connexion à l'espace personnel. Le POURQUOI : le navigateur envoie le mot de
 * passe unique une seule fois, le serveur le vérifie et rend un cookie signé.
 * Le mot de passe stocké et la clé interne de l'API ne quittent jamais le
 * serveur ; seul le cookie de session (httpOnly, donc illisible par le
 * JavaScript de la page) redescend vers le navigateur.
 */

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const jsonError = (status: number, message: string): Response =>
  NextResponse.json({ error: message }, { status });

/** Mot de passe configuré, ou `undefined` quand l'espace personnel est éteint. */
const configuredPassword = (): string | undefined => {
  const password = process.env.PROFILE_PASSWORD;
  return password === undefined || password === "" ? undefined : password;
};

/**
 * Comparaison sans arrêt anticipé : une comparaison `===` s'arrête au premier
 * caractère différent et laisse mesurer combien de caractères sont bons.
 */
const constantTimeEqual = (left: string, right: string): boolean => {
  const first = new TextEncoder().encode(left);
  const second = new TextEncoder().encode(right);
  let difference = first.length ^ second.length;
  const length = Math.max(first.length, second.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (first[index] ?? 0) ^ (second[index] ?? 0);
  }

  return difference === 0;
};

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export const POST = async (request: Request): Promise<Response> => {
  const password = configuredPassword();
  if (password === undefined || process.env.SESSION_SECRET === undefined) {
    return jsonError(503, "espace personnel non configuré");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "corps de requête illisible");
  }

  const candidate =
    typeof body === "object" && body !== null && "password" in body
      ? (body as { readonly password?: unknown }).password
      : undefined;

  if (typeof candidate !== "string" || !constantTimeEqual(candidate, password)) {
    return jsonError(401, "mot de passe incorrect");
  }

  let token: string;
  try {
    token = await createSessionToken();
  } catch {
    // Secret absent ou inutilisable : rien à poser, et on ne le dit pas en clair.
    return jsonError(503, "espace personnel non configuré");
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    ...cookieOptions,
    name: SESSION_COOKIE,
    value: token,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
};

export const DELETE = (): Response => {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({ ...cookieOptions, name: SESSION_COOKIE, value: "", maxAge: 0 });
  return response;
};
