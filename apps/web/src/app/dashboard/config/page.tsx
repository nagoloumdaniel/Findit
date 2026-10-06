import type { Metadata } from "next";

import { EmptyState } from "../../../components/dashboard/empty-state";

export const metadata: Metadata = { title: "Configuration" };

export default function ConfigPage() {
  return (
    <>
      <h1>Configuration</h1>
      <EmptyState />
    </>
  );
}
