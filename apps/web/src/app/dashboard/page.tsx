import type { Metadata } from "next";

import { fetchAgentStats } from "../../lib/api";

export const metadata: Metadata = { title: "Vue d’ensemble" };
export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const stats = await fetchAgentStats();

  const cards = stats.ok
    ? [
        { label: "Dernier run", value: stats.data.lastRun?.status ?? "Aucun" },
        { label: "Sources", value: String(stats.data.sourceCount) },
        { label: "Pages", value: String(stats.data.pageCount) },
        { label: "Nouvelles données", value: String(stats.data.publishedJobCount) },
      ]
    : [
        { label: "Dernier run", value: "—" },
        { label: "Sources", value: "—" },
        { label: "Pages", value: "—" },
        { label: "Nouvelles données", value: "—" },
      ];

  return (
    <>
      <h1>Vue d’ensemble</h1>
      <p className="dashboard-lead">
        Statut de l’agent de collecte. Les compteurs restent à zéro tant que l’agent n’a pas été
        lancé.
      </p>
      <div className="stat-grid">
        {cards.map((card) => (
          <div className="stat-card" key={card.label}>
            <p className="stat-card-label">{card.label}</p>
            <p className="stat-card-value">{card.value}</p>
          </div>
        ))}
      </div>
      {stats.ok ? null : <p className="dashboard-lead">L’API est injoignable.</p>}
    </>
  );
}
