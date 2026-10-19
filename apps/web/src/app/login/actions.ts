"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionToken, login } from "../../lib/auth";

/** Lit un champ texte d'un formulaire ; un champ absent ou fichier rend "". */
const readField = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** Connecte l'utilisateur, puis le ramène à la page de provenance ou au profil. */
export async function loginAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const email = readField(formData, "email").trim();
  const password = readField(formData, "password");

  const result = await login(email, password);
  if (!result.ok) {
    return { error: result.reason };
  }

  redirect("/moi");
}

/** Déconnecte : les cookies de session sont effacés. */
export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token !== null) {
    const apiUrl = (await import("@findit/config")).parseWebEnv(process.env).NEXT_PUBLIC_API_URL;
    try {
      await fetch(new URL("/api/auth/logout", apiUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // La révocation côté serveur a échoué ; les cookies locaux sont quand même
      // effacés, la session expirera d'elle-même.
    }
  }

  const store = await cookies();
  store.delete("findit_session");
  store.delete("findit_user");
  redirect("/");
}
