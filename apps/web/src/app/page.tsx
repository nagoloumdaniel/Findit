import { PageShell } from "@findit/ui";

import Link from "next/link";

import { JobCard } from "../components/job-card";
import { JobFilters } from "../components/job-filters";
import { JobPagination } from "../components/job-pagination";
import { JobSearch } from "../components/job-search";
import { Logo } from "../components/logo";
import { MatchCard } from "../components/match-card";
import { fetchFilterOptions, fetchJobs, fetchStats } from "../lib/api";
import { exactDateTime } from "../lib/labels";
import { fetchRanked, isMatchConfigured } from "../lib/matching-api";

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

/*
 * Lien qui active ou désactive le mode correspondance en conservant les autres
 * paramètres. `match` ne fait pas partie de `ALLOWED` : il est lu à part, jamais
 * transmis à l'API des offres.
 */
const modeLink = (current: URLSearchParams, match: boolean): string => {
  const next = new URLSearchParams(current);
  if (match) {
    next.set("match", "1");
  } else {
    next.delete("match");
  }
  const query = next.toString();
  return query === "" ? "/" : `/?${query}`;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = toSearchParams(params);
  const now = new Date();

  /*
   * Mode « correspondance avec mon profil » : activé uniquement quand
   * `match=1` est demandé ET que l'espace personnel est configuré. La
   * recherche classique (défaut) n'affiche jamais de score sur les cartes.
   */
  const matchMode = params["match"] === "1" && isMatchConfigured();
  const freshness = search.get("freshness") ?? "LAST_5D";

  const [jobs, options, stats, ranked] = await Promise.all([
    matchMode ? Promise.resolve(null) : fetchJobs(search),
    fetchFilterOptions(
      new URLSearchParams(
        search.get("freshness") ? { freshness: search.get("freshness") as string } : {},
      ),
    ),
    fetchStats(),
    matchMode ? fetchRanked(freshness) : Promise.resolve([]),
  ]);

  return (
    <PageShell>
      <header className="hero">
        <Logo />
        {/* Entrée personnelle d'abord, exploitation ensuite : la page publique
            reste l'objet principal, mais « Mon espace » est le chemin naturel
            pour la personne qui utilise Findit pour elle-même. */}
        <nav className="top-nav" aria-label="Navigation principale">
          <Link href="/moi">Mon espace</Link>
          <Link href="/dashboard">Exploitation</Link>
        </nav>
        <h1>Alternances développeur en Île-de-France</h1>
        <p className="intro">
          Offres Front-end, Back-end, Full-stack et Software Engineering publiées au cours des 5
          derniers jours, de la plus récente à la plus ancienne. Les stages, le mobile et les
          métiers de la data restent à un filtre près.
        </p>

        {stats.ok ? (
          <p className="hero-note">
            {stats.data.publishedLast5d === 0
              ? "Aucune offre publiée durant les 5 derniers jours."
              : `${stats.data.publishedLast5d} offre${stats.data.publishedLast5d > 1 ? "s" : ""} publiée${stats.data.publishedLast5d > 1 ? "s" : ""} durant les 5 derniers jours.`}
            {/*
              Les deux comptes ne mesurent pas la même chose : ce paragraphe compte
              tout ce qui est publié, la liste n'affiche que ce qui entre dans le
              périmètre (métiers et contrats du projet). Sans cette précision,
              « 12 offres publiées » au-dessus de « 3 offres » se lit comme une
              erreur — constat du 2026-10-07, corrigé ici.
            */}
            {jobs !== null && jobs.ok && jobs.data.total < stats.data.publishedLast5d
              ? ` ${String(jobs.data.total)} ${jobs.data.total > 1 ? "correspondent" : "correspond"} au périmètre affiché ci-dessous.`
              : null}
            {stats.data.lastPublishedAt
              ? ` Dernière publication le ${exactDateTime(stats.data.lastPublishedAt)}.`
              : null}
          </p>
        ) : (
          <p className="hero-note">Le décompte des offres n’a pas pu être vérifié.</p>
        )}
      </header>

      {/* Recherche et bouton Filtres sur la même ligne ; le panneau déplié
          occupe toute la largeur en dessous (details en display: contents).
          Les filtres restent ouverts quand l'un d'eux est actif : l'état
          doit se voir. */}
      <div className="search-filter-row">
        <JobSearch current={search} />
        {options.ok ? (
          <details
            className="filters-toggle"
            open={["freshness", "role", "contract", "department", "workMode"].some(
              (key) => search.get(key) !== null,
            )}
          >
            <summary className="filters-toggle-button">
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                <path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5z" />
              </svg>
              Filtres
            </summary>
            <JobFilters options={options.data} current={search} />
          </details>
        ) : null}
      </div>

      {/*
        Mode de recherche : la correspondance au profil est un choix explicite.
        La recherche classique n'affiche jamais de score ; le mode correspondance
        en affiche un sur chaque offre dont l'analyse est fiable. Le mode actif
        reste visible ici, et identifiable dans l'URL (`match=1`).
      */}
      {isMatchConfigured() ? (
        <p className="match-toggle">
          {matchMode ? (
            <>
              Mode « correspondance avec mon profil » actif.{" "}
              <Link href={modeLink(search, false)}>Revenir à la recherche classique</Link>
            </>
          ) : (
            <Link href={modeLink(search, true)}>Correspondance avec mon profil</Link>
          )}
        </p>
      ) : null}

      <section className="results" aria-label="Offres">
        {matchMode ? (
          ranked.length === 0 ? (
            <div className="state-panel" role="status">
              <h2>Aucune offre à classer.</h2>
              <p>
                Le profil est renseigné mais aucune offre publiée ne peut être notée, ou le
                classement n’est pas disponible. La recherche classique reste accessible.
              </p>
            </div>
          ) : (
            <>
              <p className="results-count">
                {`${ranked.length} offre${ranked.length > 1 ? "s" : ""} classée${ranked.length > 1 ? "s" : ""} par correspondance`}
              </p>
              <ul className="job-grid">
                {ranked.map((item) => (
                  <li key={item.jobSlug}>
                    <MatchCard item={item} now={now} />
                  </li>
                ))}
              </ul>
            </>
          )
        ) : !jobs!.ok ? (
          <div className="state-panel" role="status">
            <h2>Les offres ne sont pas disponibles.</h2>
            <p>
              Le service qui les fournit est injoignable. Aucune offre n’est affichée tant que la
              liste ne peut pas être vérifiée : mieux vaut ne rien montrer qu’une liste incomplète.
            </p>
          </div>
        ) : jobs!.data.total === 0 ? (
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
              {`${jobs!.data.total} offre${jobs!.data.total > 1 ? "s" : ""}`}
            </p>
            <ul className="job-grid">
              {jobs!.data.items.map((job) => (
                <li key={job.slug}>
                  <JobCard job={job} now={now} />
                </li>
              ))}
            </ul>
            <JobPagination
              current={search}
              page={jobs!.data.page}
              pageSize={jobs!.data.pageSize}
              total={jobs!.data.total}
            />
          </>
        )}
      </section>
    </PageShell>
  );
}
