import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "../components/app-shell";
import { getSessionUser } from "../lib/auth";
import { THEME_INIT_SCRIPT } from "../lib/theme";

import "./globals.css";
import "./motion.css";

/*
 * Les polices sont téléchargées à la compilation puis servies par
 * l'application. Rien n'est demandé à un tiers au moment de la visite, et la
 * page ne dépend d'aucune police installée sur le poste du visiteur.
 *
 * Les deux familles sont variables : les graisses intermédiaires du système
 * typographique sont donc réellement rendues, et non arrondies à 400 ou 700.
 */
const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Findit",
  description:
    "Toutes les offres d'emploi récentes en Île-de-France : CDI, CDD, intérim, stage et alternance, tous domaines confondus.",
  icons: {
    icon: [
      { url: "/logonoir.png", media: "(prefers-color-scheme: light)" },
      { url: "/logoblanc.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

// Les valeurs correspondent aux tokens --bg des deux thèmes définis dans globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getSessionUser();

  return (
    /*
     * `suppressHydrationWarning` est nécessaire ici : le script du `<head>`
     * pose `data-theme` sur `<html>` avant l'hydratation, React ne peut donc
     * pas comparer les attributs qu'il n'a pas rendus lui-même.
     */
    <html lang="fr" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/*
         * Script bloquant : il lit le choix stocké, sinon la préférence système,
         * et pose le thème avant le premier rendu. Sans lui, la page s'affiche en
         * clair puis bascule — un flash, plus laid que pas de thème du tout.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
