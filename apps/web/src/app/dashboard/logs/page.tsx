import type { Metadata } from "next";

import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Logs" };

export default function LogsPage() {
  return (
    <>
      <h1>Logs</h1>
      <EmptyState />
    </>
  );
}
