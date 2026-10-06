import type { Metadata } from "next";

import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Sources" };

export default function SourcesPage() {
  return (
    <>
      <h1>Sources</h1>
      <EmptyState />
    </>
  );
}
