import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

/*
 * Sections du dashboard administrateur. La liste vit ici, dans le layout
 * partagé, pour que l'ordre et les libellés soient identiques sur toutes les
 * pages sans être dupliqués. Chaque entrée est une adresse stable : la
 * navigation se fait au clic, sans état local, donc sans composant client.
 */
const SECTIONS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/sources", label: "Sources" },
  { href: "/dashboard/jobs", label: "Jobs" },
  { href: "/dashboard/crawls", label: "Crawls" },
  { href: "/dashboard/agent", label: "Agent" },
  { href: "/dashboard/matching", label: "Matching" },
  { href: "/dashboard/logs", label: "Logs" },
  { href: "/dashboard/config", label: "Configuration" },
] as const;

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s - Dashboard" },
};

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <p className="dashboard-sidebar-title">Administration</p>
        <nav className="dashboard-nav" aria-label="Sections du dashboard">
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link href={section.href}>{section.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link className="dashboard-back" href="/">
          Retour au site
        </Link>
      </aside>
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
