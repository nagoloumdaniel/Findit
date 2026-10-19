"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { SessionUser } from "../lib/auth";
import { logoutAction } from "../app/login/actions";
import { ThemeIconButton } from "./theme-icon-button";

export type AppShellProps = Readonly<{
  user: SessionUser | null;
  children: ReactNode;
}>;

/** Liens de la barre latérale. */
const NAV_ITEMS = [
  { href: "/", label: "Recherche", icon: "🔍" },
  { href: "/moi", label: "Mon profil", icon: "👤" },
  { href: "/dashboard", label: "Dashboard", icon: "🧭" },
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

/*
 * Coquille d'application : barre latérale (repliable), barre supérieure avec la
 * bascule de thème et la connexion/déconnexion en haut à droite, contenu et pied
 * de page. Tout reste visible sur toutes les pages ; la barre latérale se réduit
 * à ses icônes.
 */
export const AppShell = ({ user, children }: AppShellProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app-shell${collapsed ? " app-shell-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Navigation principale">
        <Link href="/" className="sidebar-brand">
          <span className="sidebar-brand-mark">F</span>
          {collapsed ? null : <span className="sidebar-brand-name">Findit</span>}
        </Link>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="sidebar-link" title={item.label}>
              <span className="sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              {collapsed ? null : <span className="sidebar-label">{item.label}</span>}
            </Link>
          ))}
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
          <span>Findit - recherche d'alternance et de stage en Île-de-France</span>
        </footer>
      </div>
    </div>
  );
};
