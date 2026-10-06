import type { Metadata } from "next";

import { fetchAgentSources } from "../../../lib/api";
import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const result = await fetchAgentSources();

  if (!result.ok) {
    return (
      <>
        <h1>Sources</h1>
        <p className="dashboard-lead">L’API est injoignable.</p>
      </>
    );
  }

  if (result.data.length === 0) {
    return (
      <>
        <h1>Sources</h1>
        <EmptyState />
      </>
    );
  }

  return (
    <>
      <h1>Sources</h1>
      <ul className="dashboard-list">
        {result.data.map((source) => (
          <li className="dashboard-row" key={source.id}>
            <span className="dashboard-row-title">{source.name}</span>
            <span className="dashboard-row-meta">{source.url}</span>
            <span className="dashboard-row-meta">
              {source.enabled ? "active" : "inactive"} · {source.type} · priorité {source.priority}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
