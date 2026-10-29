import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AppShell } from "../components/app-shell";
import { getSessionUser } from "../lib/auth";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "../lib/site";
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

/*
 * Métadonnées par défaut du site. Les pages privées (`/moi`, `/dashboard`,
 * connexion) les surchargent par `noindex` ; la fiche d'offre fournit son propre
 * titre et son canonical. L'image Open Graph vient de `opengraph-image.tsx`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} - offres d'emploi en France`, template: `%s - ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "fr_FR",
    title: `${SITE_NAME} - offres d'emploi en France`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - offres d'emploi en France`,
    description: SITE_DESCRIPTION,
  },
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
      {/*
       * `suppressHydrationWarning` sur <body> : certaines extensions de
       * navigateur injectent des attributs (`bis_register`, `bis_skin_checked`)
       * avant l'hydratation. Ce sont des attributs que React n'a pas rendus, et
       * il n'y a rien à corriger dans le HTML de l'application. La liste des
       * attributs concernés dépend de l'extension installée, pas du code.
       */}
      <body suppressHydrationWarning>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
