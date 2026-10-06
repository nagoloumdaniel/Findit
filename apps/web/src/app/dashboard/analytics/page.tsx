import type { Metadata } from "next";

import { formatCount, formatUsd } from "../../../lib/format";
import { fetchAgentAnalytics } from "../../../lib/api";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const result = await fetchAgentAnalytics();

  if (!result.ok) {
    return (
      <>
        <h1>Analytics</h1>
        <p className="dashboard-lead">L’API est injoignable.</p>
      </>
    );
  }

  const { publishedPerDay, topSources, topCompanies, runStatuses, modelCost, matchingCost } =
    result.data;

  const runStatusRows = [
    { label: "Succès", count: runStatuses.succeeded },
    { label: "Échec", count: runStatuses.failed },
    { label: "Arrêté", count: runStatuses.stopped },
  ];

  return (
    <>
      <h1>Analytics</h1>
      <p className="dashboard-lead">
        Activité des 14 derniers jours, par source, par entreprise et par issue de run. Les listes
        restent à zéro tant que l’agent n’a rien collecté.
      </p>

      <h2>Offres publiées par jour</h2>
      <ul className="dashboard-list">
        {publishedPerDay.map((day) => (
          <li className="dashboard-row" key={day.date}>
            <span className="dashboard-row-title">{day.date}</span>
            <span className="dashboard-row-meta">{day.count} offre(s)</span>
          </li>
        ))}
      </ul>

      <h2>Top 5 des sources</h2>
      <ul className="dashboard-list">
        {topSources.map((source) => (
          <li className="dashboard-row" key={source.name}>
            <span className="dashboard-row-title">{source.name}</span>
            <span className="dashboard-row-meta">{source.pageCount} page(s)</span>
          </li>
        ))}
      </ul>

      <h2>Top 5 des entreprises</h2>
      <ul className="dashboard-list">
        {topCompanies.map((company) => (
          <li className="dashboard-row" key={company.name}>
            <span className="dashboard-row-title">{company.name}</span>
            <span className="dashboard-row-meta">{company.jobCount} offre(s)</span>
          </li>
        ))}
      </ul>

      <h2>Issues des runs</h2>
      <ul className="dashboard-list">
        {runStatusRows.map((row) => (
          <li className="dashboard-row" key={row.label}>
            <span className="dashboard-row-title">{row.label}</span>
            <span className="dashboard-row-meta">{row.count}</span>
          </li>
        ))}
      </ul>

      <h2>Coût du modèle</h2>
      <p className="dashboard-lead">
        {modelCost.runCount === 0
          ? "Aucun run sur la fenêtre."
          : `${formatCount(modelCost.runCount)} run(s) · ${formatUsd(modelCost.totalCostMicroUsd)} · ${formatCount(modelCost.totalInputTokens)} tokens d’entrée, ${formatCount(modelCost.totalOutputTokens)} de sortie.`}
      </p>
      {modelCost.totalCostMicroUsd === 0 ? (
        <p className="dashboard-lead">
          Coût à zéro : renseigner DEEPSEEK_INPUT_USD_PER_MTOK et DEEPSEEK_OUTPUT_USD_PER_MTOK pour
          l’estimer. Les tokens consommés sont enregistrés dans tous les cas.
        </p>
      ) : null}
      <ul className="dashboard-list">
        {modelCost.perDay
          .filter((day) => day.costMicroUsd > 0 || day.inputTokens > 0 || day.outputTokens > 0)
          .map((day) => (
            <li className="dashboard-row" key={day.date}>
              <span className="dashboard-row-title">{day.date}</span>
              <span className="dashboard-row-meta">
                {formatUsd(day.costMicroUsd)} · {formatCount(day.inputTokens)}+
                {formatCount(day.outputTokens)} tok
              </span>
            </li>
          ))}
      </ul>

      {/* Le matching de CV n'est pas un run d'agent : sa dépense est journalisée
          à part (`ModelCall`) et se lit donc séparément. */}
      <h2>Coût du matching CV</h2>
      <p className="dashboard-lead">
        {matchingCost.callCount === 0
          ? "Aucun matching sur la fenêtre."
          : `${formatCount(matchingCost.callCount)} matching(s) · ${formatUsd(matchingCost.totalCostMicroUsd)} · ${formatCount(matchingCost.totalInputTokens)} tokens d’entrée, ${formatCount(matchingCost.totalOutputTokens)} de sortie.`}
      </p>
    </>
  );
}
