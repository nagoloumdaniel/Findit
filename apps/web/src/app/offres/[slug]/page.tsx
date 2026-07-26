import { PageShell } from "@findit/ui";
import Link from "next/link";

import { fetchJobDetail } from "../../../lib/api";
import {
  contractLabels,
  departmentLabels,
  exactDateTime,
  publishedAgo,
  qualityLabel,
  roleLabels,
  salaryPeriodLabels,
  workModeLabels,
} from "../../../lib/labels";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const search = new URLSearchParams();

  if (typeof query["freshness"] === "string") {
    search.set("freshness", query["freshness"]);
  }

  const result = await fetchJobDetail(slug, search);
  const now = new Date();

  if (!result.ok) {
    return (
      <PageShell>
        <p className="eyebrow">
          <Link href="/">Retour aux offres</Link>
        </p>
        <div className="state-panel" role="status">
          <h2>Cette offre ne peut pas être affichée.</h2>
          <p>Le service qui la fournit est injoignable. Réessayer plus tard.</p>
        </div>
      </PageShell>
    );
  }

  if (!result.data) {
    return (
      <PageShell>
        <p className="eyebrow">
          <Link href="/">Retour aux offres</Link>
        </p>
        <div className="state-panel" role="status">
          <h2>Cette offre n’est plus disponible.</h2>
          <p>
            Elle a expiré, elle est hors de la fenêtre demandée, ou elle n’existe pas. Une offre
            n’est jamais affichée au-delà de 72 heures après sa publication.
          </p>
        </div>
      </PageShell>
    );
  }

  const job = result.data;
  const salary =
    job.salaryMin !== null && job.salaryMax !== null
      ? `${job.salaryMin} - ${job.salaryMax} € ${job.salaryPeriod ? (salaryPeriodLabels[job.salaryPeriod] ?? "") : ""}`
      : (job.salaryText ?? null);

  return (
    <PageShell>
      <p className="eyebrow">
        <Link href="/">Retour aux offres</Link>
      </p>

      {job.isDemo ? (
        <p className="demo-flag demo-flag-page">
          Offre de démonstration. Elle n’existe chez aucun employeur réel : ne pas y postuler.
        </p>
      ) : null}

      <header className="detail-head">
        <p className={`role-badge role-${job.roleCategory.toLowerCase()}`}>
          {roleLabels[job.roleCategory] ?? job.roleCategory}
        </p>
        <h1 className="detail-title">{job.title}</h1>
        <p className="detail-company">
          {job.companyName} - {job.city} ({job.departmentCode} ·{" "}
          {departmentLabels[job.departmentCode] ?? "Île-de-France"})
        </p>
        <p className="detail-date">
          Publiée le <time dateTime={job.publishedAt}>{exactDateTime(job.publishedAt)}</time> (
          {publishedAgo(job.publishedAt, now)})
        </p>
      </header>

      <dl className="detail-facts">
        <div>
          <dt>Contrat</dt>
          <dd>{contractLabels[job.contractType] ?? job.contractType}</dd>
        </div>
        <div>
          <dt>Présence</dt>
          <dd>{workModeLabels[job.workMode] ?? job.workMode}</dd>
        </div>
        <div>
          <dt>Rémunération</dt>
          <dd>{salary ?? "Non communiquée"}</dd>
        </div>
        <div>
          <dt>Niveau d’études</dt>
          <dd>{job.studyLevel ?? "Non communiqué"}</dd>
        </div>
        <div>
          <dt>Durée</dt>
          <dd>{job.duration ?? "Non communiquée"}</dd>
        </div>
        <div>
          <dt>Fiabilité de la source</dt>
          <dd>{qualityLabel(job.dataQualityScore)}</dd>
        </div>
      </dl>

      <section className="detail-section" aria-labelledby="description-title">
        <h2 id="description-title">Description</h2>
        <p>{job.description}</p>
      </section>

      {job.responsibilities.length > 0 ? (
        <section className="detail-section" aria-labelledby="missions-title">
          <h2 id="missions-title">Missions</h2>
          <ul className="detail-list">
            {job.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {job.requirements.length > 0 ? (
        <section className="detail-section" aria-labelledby="profil-title">
          <h2 id="profil-title">Profil recherché</h2>
          <ul className="detail-list">
            {job.requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {job.skills.length > 0 ? (
        <section className="detail-section" aria-labelledby="tech-title">
          <h2 id="tech-title">Technologies</h2>
          <ul className="tag-list">
            {job.skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
       * Le bouton renvoie vers la source d'origine. L'application ne transmet
       * jamais de candidature.
       */}
      <section className="detail-section" aria-labelledby="sources-title">
        <h2 id="sources-title">Voir l’offre à la source</h2>
        <p className="detail-note">
          Findit ne transmet aucune candidature. La candidature se fait sur le site d’origine.
        </p>

        <a
          className="source-primary"
          href={job.canonicalSource?.url ?? job.canonicalUrl}
          target="_blank"
          rel="noreferrer noopener nofollow"
        >
          Ouvrir sur {job.canonicalSource?.name ?? "la source"}
        </a>

        {job.sources.length > 1 ? (
          <>
            <p className="detail-note">Cette offre a aussi été vue ici :</p>
            <ul className="source-list">
              {job.sources.slice(1).map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer noopener nofollow">
                    {source.name}
                  </a>
                  <span className="source-checked">
                    vérifiée le {exactDateTime(source.checkedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </PageShell>
  );
}
