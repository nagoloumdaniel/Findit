/*
 * Identité publique du site : adresse canonique, nom et description.
 *
 * Le POURQUOI d'un module dédié : `metadataBase`, `robots.txt`, le sitemap et
 * les balises Open Graph doivent partager la même adresse, sinon un canonical
 * pointerait ailleurs que le sitemap. `NEXT_PUBLIC_SITE_URL` permet de la
 * surcharger (domaine personnalisé, prévisualisation) ; sans elle, c'est le
 * déploiement de production actuel.
 */
const DEFAULT_SITE_URL = "https://finditfr.vercel.app";

export const SITE_NAME = "Findit";

export const SITE_DESCRIPTION =
  "Toutes les offres d'emploi récentes en France : CDI, CDD, intérim, stage et alternance, tous domaines confondus.";

/** Adresse de base sans barre finale, pour composer des URL absolues. */
export const siteUrl = (): string => {
  const raw = process.env["NEXT_PUBLIC_SITE_URL"];
  const value = raw === undefined || raw.trim() === "" ? DEFAULT_SITE_URL : raw.trim();
  return value.replace(/\/+$/u, "");
};

/** Chemins qui ne doivent jamais être indexés : espace personnel, exploitation, connexion, API. */
export const PRIVATE_PATHS = ["/moi", "/dashboard", "/login", "/connexion", "/api/"] as const;
