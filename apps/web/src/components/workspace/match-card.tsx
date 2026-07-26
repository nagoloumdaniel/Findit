import type { MatchView } from "../../lib/workspace-api";

/** Libellés d'affichage des critères du moteur de score. */
const CRITERION_LABELS: Record<string, string> = {
  required_skills: "Compétences exigées",
  preferred_skills: "Compétences souhaitées",
  title_alignment: "Alignement d'intitulé",
  languages: "Langues",
};

/*
 * Le score s'affiche avec ses raisons, jamais seul : critères pondérés,
 * compétences couvertes et manquantes, recommandations. Un avertissement de
 * données insuffisantes est montré tel quel, pas caché.
 */
export const MatchCard = ({ match }: { match: MatchView }) => (
  <div className="match-card">
    <div className="match-headline">
      <span className="match-score">{match.score}/100</span>
      <span className="match-confidence">confiance {match.confidence}/100</span>
    </div>

    {match.insufficientDataWarning !== null && (
      <p className="workspace-error" role="alert">
        {match.insufficientDataWarning}
      </p>
    )}

    <ul className="match-breakdown">
      {match.scoreBreakdown.map((criterion) => (
        <li key={criterion.criterion}>
          <span className="match-criterion">
            {CRITERION_LABELS[criterion.criterion] ?? criterion.criterion}
          </span>{" "}
          {criterion.points.toFixed(1)} pt sur {criterion.weight.toFixed(1)} (couverture{" "}
          {Math.round(criterion.rawScore * 100)} %)
        </li>
      ))}
    </ul>

    {match.matchedSkills.length > 0 && (
      <p className="match-line">
        Couvertes :{" "}
        {match.matchedSkills.map((skill) => (
          <span key={skill} className="chip chip-ok">
            {skill}
          </span>
        ))}
      </p>
    )}
    {(match.missingSkills.length > 0 || match.missingKeywords.length > 0) && (
      <p className="match-line">
        Manquantes :{" "}
        {[...match.missingSkills, ...match.missingKeywords].map((skill) => (
          <span key={skill} className="chip chip-missing">
            {skill}
          </span>
        ))}
      </p>
    )}
    {match.recommendations.length > 0 && (
      <ul className="match-notes">
        {match.recommendations.map((recommendation) => (
          <li key={recommendation}>{recommendation}</li>
        ))}
      </ul>
    )}
  </div>
);
