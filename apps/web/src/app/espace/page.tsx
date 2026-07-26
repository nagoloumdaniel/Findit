import { PageShell } from "@findit/ui";
import type { Metadata } from "next";

import { Logo } from "../../components/logo";
import { WorkspacePanel } from "../../components/workspace/workspace-panel";

export const metadata: Metadata = {
  title: "Espace privé - Findit",
  description: "Gestion du CV source : import, structuration, faits extraits et export PDF.",
  // L'espace privé n'a rien à faire dans un moteur de recherche.
  robots: { index: false, follow: false },
};

export default function WorkspacePage() {
  return (
    <PageShell>
      <header className="hero">
        <Logo />
        <h1>Espace privé</h1>
        <p className="intro">
          Le CV source : import, structuration en faits vérifiés, export PDF. Tout reste sur cette
          machine - l&apos;IA tourne en local et rien ne part en ligne.
        </p>
      </header>
      <WorkspacePanel />
    </PageShell>
  );
}
