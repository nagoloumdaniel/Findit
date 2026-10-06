import type { Metadata } from "next";

import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Matching" };

export default function MatchingPage() {
  return (
    <>
      <h1>Matching</h1>
      <EmptyState />
    </>
  );
}
