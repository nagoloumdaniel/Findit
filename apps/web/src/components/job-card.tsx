import Link from "next/link";

import type { JobListItem } from "../lib/api";
import {
  contractLabels,
  departmentLabels,
  publishedAgo,
  qualityLabel,
  roleLabels,
  workModeLabels,
} from "../lib/labels";

export type JobCardProps = Readonly<{ job: JobListItem; now: Date }>;

/*
 * La carte ne propose aucun bouton de candidature : l'application redirige vers
 * la source et ne postule jamais à la place du candidat.
 */
export const JobCard = ({ job, now }: JobCardProps) => (
  <article className="job-card">
    {job.isDemo ? (
      <p className="demo-flag">Démonstration - cette offre n’existe chez aucun employeur</p>
    ) : null}

    <div className="job-card-head">
      <p className={`role-badge role-${job.roleCategory.toLowerCase()}`}>
        {roleLabels[job.roleCategory] ?? job.roleCategory}
      </p>
      <p className="job-age">
        <time dateTime={job.publishedAt}>{publishedAgo(job.publishedAt, now)}</time>
      </p>
    </div>

    <h3 className="job-title">
      <Link href={`/offres/${job.slug}`}>{job.title}</Link>
    </h3>

    <p className="job-company">
      {job.companyName} - {job.city} ({job.departmentCode} ·{" "}
      {departmentLabels[job.departmentCode] ?? "Île-de-France"})
    </p>

    <ul className="job-meta" aria-label="Caractéristiques du poste">
      <li>{contractLabels[job.contractType] ?? job.contractType}</li>
      <li>{workModeLabels[job.workMode] ?? job.workMode}</li>
      <li className="job-quality">{qualityLabel(job.dataQualityScore)}</li>
    </ul>

    {job.skills.length > 0 ? (
      <ul className="tag-list" aria-label="Technologies principales">
        {job.skills.slice(0, 6).map((skill) => (
          <li key={skill}>{skill}</li>
        ))}
      </ul>
    ) : null}

    {/*
     * Une offre reprise d'un job board est signalée comme telle : le lecteur
     * doit savoir que la description affichée en détail n'est qu'un extrait
     * d'un contenu qui ne nous appartient pas.
     */}
    <p className="job-source">
      {job.origin === "JOB_BOARD" ? "Job board - " : null}
      {job.canonicalSource ? `Source : ${job.canonicalSource.name}` : "Source non renseignée"}
    </p>
  </article>
);
