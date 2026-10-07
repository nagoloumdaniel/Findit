import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@findit/shared", "@findit/ui"],
  /*
   * Le serveur de développement écoute sur 0.0.0.0 (voir run-next.mjs). Next 16
   * traite alors toute autre adresse comme une origine étrangère et **bloque les
   * ressources de développement** : mesuré le 2026-10-07, en passant par
   * 127.0.0.1 le client ne s'hydratait plus (aucune clé React sur les champs,
   * boutons inertes) alors que localhost fonctionnait. Déclarer les deux évite
   * qu'un outil de test ou un navigateur se trompe d'adresse et croie le site
   * cassé.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
