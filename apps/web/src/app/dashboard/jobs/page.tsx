import type { Metadata } from "next";

import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <>
      <h1>Jobs</h1>
      <EmptyState />
    </>
  );
}
