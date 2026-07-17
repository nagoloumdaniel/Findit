import { PageShell } from "@findit/ui";

import { JobCard } from "../components/job-card";
import { JobFilters } from "../components/job-filters";
import { JobPagination } from "../components/job-pagination";
import { JobSearch } from "../components/job-search";
import { Logo } from "../components/logo";
import { fetchFilterOptions, fetchJobs, fetchStats } from "../lib/api";
import { exactDateTime } from "../lib/labels";

/// Les offres changent d'heure en heure : la page est rendue à chaque requête.
export const dynamic = "force-dynamic";

/*
 * Ne transmet à l'API que les paramètres qu'elle accepte. Une valeur invalide
 * n'est pas corrigée en silence : l'API la rejette et la page l'affiche.
 */
const ALLOWED = ["freshness", "role", "contract", "department", "workMode", "q", "sort", "page"];

const toSearchParams = (params: Record<string, string | string[] | undefined>): URLSearchParams => {
  const search = new URLSearchParams();

  for (const key of ALLOWED) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0) {
      search.set(key, value);
    }
  }

  return search;
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = toSearchParams(params);
  const now = new Date();

  const [jobs, options, stats] = await Promise.all([
    fetchJobs(search),
    fetchFilterOptions(
      new URLSearchParams(
        search.get("freshness") ? { freshness: search.get("freshness") as string } : {},
      ),
    ),
    fetchStats(),
  ]);

  return (
    <PageShell>
      <header className="hero">
        <Logo />
        <h1>Alternances et stages développeur en Île-de-France</h1>
        <p className="intro">
          Offres Front-end, Back-end, Full-stack, Mobile, Data Analyst et Data Engineer publiées au
          cours des dernières 24 heures.
        </p>

        {stats.ok ? (
          <p className="hero-note">
            {stats.data.publishedLast24h === 0
              ? "Aucune offre publiée durant les dernières 24 heures."
              : `${stats.data.publishedLast24h} offre${stats.data.publishedLast24h > 1 ? "s" : ""} publiée${stats.data.publishedLast24h > 1 ? "s" : ""} durant les dernières 24 heures.`}
            {stats.data.lastPublishedAt
              ? ` Dernière publication le ${exactDateTime(stats.data.lastPublishedAt)}.`
              : null}
          </p>
        ) : (
          <p className="hero-note">Le décompte des offres n’a pas pu être vérifié.</p>
        )}
      </header>

      <JobSearch current={search} />

      {options.ok ? <JobFilters options={options.data} current={search} /> : null}

      <section className="results" aria-label="Offres">
        {!jobs.ok ? (
          <div className="state-panel" role="status">
            <h2>Les offres ne sont pas disponibles.</h2>
            <p>
              Le service qui les fournit est injoignable. Aucune offre n’est affichée tant que la
              liste ne peut pas être vérifiée : mieux vaut ne rien montrer qu’une liste incomplète.
            </p>
          </div>
        ) : jobs.data.total === 0 ? (
          <div className="state-panel" role="status">
            <h2>Aucune offre ne correspond.</h2>
            <p>
              {search.get("q")
                ? `Aucune offre publiée ne correspond à « ${search.get("q")} » avec ces filtres. Élargir à « 3 derniers jours », retirer un filtre ou chercher un autre terme peut donner des résultats.`
                : "Aucune offre publiée ne correspond à ces filtres. Élargir à « 3 derniers jours » ou retirer un filtre peut donner des résultats."}
            </p>
          </div>
        ) : (
          <>
            <p className="results-count">
              {`${jobs.data.total} offre${jobs.data.total > 1 ? "s" : ""}`}
            </p>
            <ul className="job-grid">
              {jobs.data.items.map((job) => (
                <li key={job.slug}>
                  <JobCard job={job} now={now} />
                </li>
              ))}
            </ul>
            <JobPagination
              current={search}
              page={jobs.data.page}
              pageSize={jobs.data.pageSize}
              total={jobs.data.total}
            />
          </>
        )}
      </section>
    </PageShell>
  );
}
