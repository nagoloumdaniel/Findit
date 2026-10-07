import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, isValidSessionToken } from "./lib/session";

/*
 * Protège ce qui n'est pas public : l'espace personnel (`/moi`) **et** le
 * dashboard d'exploitation (`/dashboard`).
 *
 * Le POURQUOI d'avoir étendu la garde au 2026-10-07 : seul `/moi` était protégé,
 * et le site étant en ligne, `/dashboard`, `/dashboard/logs`, `/dashboard/config`
 * et `/dashboard/crawls` répondaient **200 sans mot de passe** — journaux,
 * configuration et état interne lisibles par quiconque connaît l'URL. Ce qui n'est
 * pas destiné au public passe par la même porte que l'espace personnel ; il n'y a
 * qu'un mot de passe, donc il n'y a qu'une garde.
 *
 * Le POURQUOI du garde-fou de configuration : sans `PROFILE_PASSWORD`, il n'y a
 * rien à protéger, et rediriger ferait une boucle - la page protégée vers
 * `/connexion`, puis le formulaire qui répond 503. On laisse donc passer, et
 * c'est `/moi` qui annonce « espace personnel non configuré ».
 *
 * Le POURQUOI de `proxy` et non `middleware` : Next 16 a renommé la convention,
 * et sous cette version le fichier `middleware.ts` laissait le serveur de
 * développement sans hydratation (mesuré le 2026-10-07 : aucune clé React sur les
 * champs, bouton jamais activé, alors que le build de production fonctionnait).
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const password = process.env.PROFILE_PASSWORD;
  if (password === undefined || password === "") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSessionToken(token)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/connexion", request.url));
}

export const config = {
  matcher: ["/moi", "/moi/:path*", "/dashboard", "/dashboard/:path*"],
};
