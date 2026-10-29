import type { MetadataRoute } from "next";

import { fetchJobs } from "../lib/api";
import { siteUrl } from "../lib/site";

/*
 * Accueil + offres publiées les plus récentes. Une offre n'est jamais exposée
 * au-delà de cinq jours : le sitemap se régénère donc toutes les heures plutôt
 * que d'être figé au build. Si l'API est injoignable, le sitemap se réduit à
 * l'accueil au lieu d'échouer.
 */
export const revalidate = 3600;

const PAGE_SIZE = 50;
const MAX_PAGES = 2;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
  ];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const search = new URLSearchParams({
      freshness: "LAST_5D",
      pageSize: String(PAGE_SIZE),
      page: String(page),
    });
    const result = await fetchJobs(search);
    if (!result.ok) {
      break;
    }

    for (const job of result.data.items) {
      if (job.isDemo) {
        continue;
      }
      entries.push({
        url: `${base}/offres/${encodeURIComponent(job.slug)}`,
        lastModified: new Date(job.publishedAt),
        changeFrequency: "daily",
        priority: 0.6,
      });
    }

    if (page * PAGE_SIZE >= result.data.total) {
      break;
    }
  }

  return entries;
}
