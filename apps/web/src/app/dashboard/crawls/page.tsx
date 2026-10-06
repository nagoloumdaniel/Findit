import type { Metadata } from "next";

import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Crawls" };

export default function CrawlsPage() {
  return (
    <>
      <h1>Crawls</h1>
      <EmptyState />
    </>
  );
}
