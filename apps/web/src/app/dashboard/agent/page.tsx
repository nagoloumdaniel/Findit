import type { Metadata } from "next";

import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Agent" };

export default function AgentPage() {
  return (
    <>
      <h1>Agent</h1>
      <EmptyState />
    </>
  );
}
