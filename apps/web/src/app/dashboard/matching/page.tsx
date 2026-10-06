import type { Metadata } from "next";

import { MatchingForm } from "../../../components/dashboard/matching-form";
import { fetchMatchingHistory } from "../../../lib/api";

export const metadata: Metadata = { title: "Matching" };

export default async function MatchingPage() {
  const history = await fetchMatchingHistory();

  return (
    <>
      <h1>Matching</h1>
      <p className="dashboard-lead">
        Colle ton CV : l’agent le structure (DeepSeek) puis le score contre les offres publiées, du
        plus au moins compatible.
      </p>
      <MatchingForm />

      {/*
        L'historique ne rend jamais le CV lui-même : la liste affiche la date, le
        nombre d'offres et le meilleur score. Le texte reste accessible par
        `GET /api/matching/history/:id`, et il est purgé passé la rétention
        (`MATCHING_RETENTION_HOURS`).
      */}
      <h2>Matchings passés</h2>
      {!history.ok ? (
        <p className="dashboard-lead">Historique indisponible : l’API ne répond pas.</p>
      ) : history.data.length === 0 ? (
        <p className="dashboard-lead">Aucun matching enregistré.</p>
      ) : (
        <ul className="dashboard-list">
          {history.data.map((run) => (
            <li className="dashboard-row" key={run.id}>
              <span className="dashboard-row-title">
                {new Date(run.createdAt).toLocaleString("fr-FR")}
              </span>
              <span className="dashboard-row-meta">
                {run.jobCount} offre(s) · meilleur score {run.bestScore}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
