import type { MetadataRoute } from "next";

import { PRIVATE_PATHS, siteUrl } from "../lib/site";

/*
 * Les offres publiques sont indexables ; l'espace personnel, le dashboard
 * d'exploitation, les écrans de connexion et les routes `/api/` ne le sont pas.
 * `robots.txt` n'est qu'une consigne de politesse : la protection réelle des
 * pages privées reste celle du serveur, et chacune porte aussi `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
