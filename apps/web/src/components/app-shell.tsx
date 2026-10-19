"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { SessionUser } from "../lib/auth";
import { logoutAction } from "../app/login/actions";
import { ThemeIconButton } from "./theme-icon-button";

export type AppShellProps = Readonly<{
  user: SessionUser | null;
  children: ReactNode;
}>;

/** Icônes SVG de la barre latérale, tracées au trait pour rester sobres. */
const ICONS = {
  search: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  profile: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
  dashboard: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
} as const;

/** Liens de la barre latérale. */
const NAV_ITEMS = [
  { href: "/", label: "Recherche", icon: ICONS.search },
  { href: "/moi", label: "Mon profil", icon: ICONS.profile },
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
] as const;

/** Nom affiché : le prénom/nom du profil, sinon l'email. */
const displayNameOf = (user: SessionUser): string => user.name ?? user.email;

/** Initiales (deux lettres au plus) pour l'avatar, à défaut de photo. */
const initialsOf = (user: SessionUser): string => {
  const source = displayNameOf(user).trim();
  if (source === "") {
    return "?";
  }
  const parts = source.split(/\s+/u).filter((part) => part !== "");
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
};

/** Vrai quand l'adresse courante correspond à ce lien (la racine exactement). */
const isActive = (pathname: string, href: string): boolean =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/*
 * Coquille d'application : barre latérale (repliable), barre supérieure avec la
 * bascule de thème et la connexion/déconnexion en haut à droite, contenu et pied
 * de page. Tout reste visible sur toutes les pages ; la barre latérale se réduit
 * à ses icônes.
 */
export const AppShell = ({ user, children }: AppShellProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className={`app-shell${collapsed ? " app-shell-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Navigation principale">
        <Link href="/" className="sidebar-brand" aria-label="Findit, accueil">
          <span className="logo sidebar-logo" aria-hidden="true" />
          {collapsed ? null : <span className="sidebar-brand-name">Findit</span>}
        </Link>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link${active ? " sidebar-link-active" : ""}`}
                title={item.label}
                aria-current={active ? "page" : undefined}
              >
                <span className="sidebar-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {collapsed ? null : <span className="sidebar-label">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="app-main">
        <header className="navbar">
          <button
            type="button"
            className="navbar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Déplier la navigation" : "Replier la navigation"}
            aria-pressed={collapsed}
          >
            ☰
          </button>

          <div className="navbar-account">
            <ThemeIconButton />
            {user === null ? (
              <Link href="/login" className="navbar-connect">
                Se connecter
              </Link>
            ) : (
              <>
                <Link href="/moi" className="navbar-profile" title="Mon profil">
                  <span className="navbar-avatar" aria-hidden="true">
                    {user.photoUrl !== undefined && user.photoUrl !== "" ? (
                      <img src={user.photoUrl} alt="" className="navbar-avatar-img" />
                    ) : (
                      initialsOf(user)
                    )}
                  </span>
                  <span className="navbar-name">{displayNameOf(user)}</span>
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="navbar-logout"
                    aria-label="Se déconnecter"
                    title="Se déconnecter"
                  >
                    ⏻
                  </button>
                </form>
              </>
            )}
          </div>
        </header>

        <main className="app-content">{children}</main>

        <footer className="app-footer">
          <span>Findit - toutes les offres d'emploi en France</span>
        </footer>
      </div>
    </div>
  );
};
