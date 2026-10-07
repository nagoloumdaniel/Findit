import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

/*
 * Sections du dashboard d'exploitation : ce qui fait tourner la collecte, pas ce
 * qui touche au profil personnel. Le POURQUOI du renommage (2026-10-07) : ce
 * dashboard s'appelait « Administration » et l'utilisateur l'a repris — Findit
 * est un outil **personnel**, l'espace privé vit sur `/moi`, ici c'est la salle
 * des machines. La liste vit dans le layout partagé pour que l'ordre et les
 * libellés soient identiques partout, sans état local.
 */
const SECTIONS = [
  { href: "/dashboard", label: "Vue d’ensemble" },
  { href: "/dashboard/jobs", label: "Offres" },
  { href: "/dashboard/sources", label: "Sources" },
  { href: "/dashboard/crawls", label: "Crawls" },
  { href: "/dashboard/agent", label: "Agent" },
  { href: "/dashboard/matching", label: "Matching" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/logs", label: "Logs" },
  { href: "/dashboard/config", label: "Configuration" },
] as const;

export const metadata: Metadata = {
  title: { default: "Exploitation", template: "%s - Exploitation" },
};

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <p className="dashboard-sidebar-title">Exploitation</p>
        <nav className="dashboard-nav" aria-label="Sections de l’exploitation">
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link href={section.href}>{section.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link className="dashboard-back" href="/moi">
          Mon espace
        </Link>
        <Link className="dashboard-back" href="/">
          Retour au site
        </Link>
      </aside>
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
