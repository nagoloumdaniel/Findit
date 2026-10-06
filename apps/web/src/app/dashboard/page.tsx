import type { Metadata } from "next";

/*
 * Vue d’ensemble du dashboard. Les compteurs sont à zéro tant que l’agent n’a
 * pas été lancé : un zéro affiché vaut « rien n’a tourné », jamais « rien
 * trouvé ». Aucun chiffre n’est donc inventé ici.
 */
const STATS = [
  { label: "Dernier run", value: "Aucun" },
  { label: "Sources", value: "0" },
  { label: "Pages", value: "0" },
  { label: "Nouvelles données", value: "0" },
] as const;

export const metadata: Metadata = { title: "Vue d’ensemble" };

export default function DashboardOverviewPage() {
  return (
    <>
      <h1>Vue d’ensemble</h1>
      <p className="dashboard-lead">
        Statut de l’agent de collecte. Les compteurs restent à zéro tant que l’agent n’a pas été
        lancé et que l’API n’est pas branchée.
      </p>
      <div className="stat-grid">
        {STATS.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <p className="stat-card-label">{stat.label}</p>
            <p className="stat-card-value">{stat.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
