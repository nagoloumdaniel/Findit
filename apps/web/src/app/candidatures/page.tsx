import { PageShell } from "@findit/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { ApplicationsPanel } from "../../components/workspace/applications-panel";
import { Logo } from "../../components/logo";

export const metadata: Metadata = {
  title: "Mes candidatures - Findit",
  description: "Suivi des candidatures : statuts, notes et historique.",
  // Page personnelle : rien à indexer.
  robots: { index: false, follow: false },
};

export default function CandidaturesPage() {
  return (
    <PageShell>
      <header className="hero">
        <Logo />
        <nav className="top-nav" aria-label="Navigation">
          <Link href="/">Offres</Link>
        </nav>
        <h1>Mes candidatures</h1>
        <p className="intro">
          Chaque dossier photographie l&apos;offre, le CV, le score et la lettre au moment de
          candidater, et garde l&apos;historique daté de ses statuts.
        </p>
      </header>
      <ApplicationsPanel workspaceKey="proxy" refreshToken={0} />
    </PageShell>
  );
}
