import Link from "next/link";

import { contractLabels, publishedAgo } from "../lib/labels";
import type { RankedItem } from "../lib/matching-api";

export type MatchCardProps = Readonly<{ item: RankedItem; now: Date }>;

/*
 * Carte du mode « correspondance avec mon profil ». Elle n'apparaît que dans ce
 * mode : la recherche classique n'affiche jamais de score, conformément à la
 * règle d'affichage. Le pourcentage n'est montré que quand l'analyse est fiable ;
 * sinon, la carte dit explicitement que le score est trop fragile, au lieu
 * d'afficher un chiffre inventé.
 */
export const MatchCard = ({ item, now }: MatchCardProps) => (
  <article className="job-card match-card">
    <div className="job-card-head">
      <p className="role-badge">{contractLabels[item.contractType] ?? item.contractType}</p>
      <p className="job-age">
        <time dateTime={item.publishedAt}>{publishedAgo(item.publishedAt, now)}</time>
      </p>
    </div>

    <h3 className="job-title">
      <Link href={`/offres/${item.jobSlug}`}>{item.jobTitle}</Link>
    </h3>

    <p className="job-company">
      {item.companyName} - {item.city}
    </p>

    {item.insufficientDataWarning === null ? (
      <p className="match-score" aria-label={`Correspondance ${item.score} sur 100`}>
        <strong className="match-score-value">{item.score}%</strong>
        <span className="match-score-label">de correspondance</span>
      </p>
    ) : (
      <p className="match-score match-score-unreliable" role="note">
        Correspondance non fiable : le profil est trop incomplet pour noter cette offre.
      </p>
    )}

    {item.matchedSkills.length > 0 ? (
      <ul className="tag-list" aria-label="Compétences couvertes">
        {item.matchedSkills.slice(0, 6).map((skill) => (
          <li key={skill}>{skill}</li>
        ))}
      </ul>
    ) : null}
  </article>
);
