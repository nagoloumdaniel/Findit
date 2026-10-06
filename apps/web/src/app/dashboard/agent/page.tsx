import type { Metadata } from "next";

import { fetchAgentRuns } from "../../../lib/api";
import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Agent" };
export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const result = await fetchAgentRuns();

  if (!result.ok) {
    return (
      <>
        <h1>Agent</h1>
        <p className="dashboard-lead">L’API est injoignable.</p>
      </>
    );
  }

  if (result.data.length === 0) {
    return (
      <>
        <h1>Agent</h1>
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <h1>Agent</h1>
      <ul className="dashboard-list">
        {result.data.map((run) => (
          <li className="dashboard-row" key={run.id}>
            <span className="dashboard-row-title">{run.objective}</span>
            <span className="dashboard-row-meta">
              {run.status} · {run.inserted} insérée(s) · {run.pages} pages · {run.errors} erreur(s)
            </span>
            <span className="dashboard-row-meta">{run.startedAt}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
