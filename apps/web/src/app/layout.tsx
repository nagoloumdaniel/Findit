import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

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
    "Alternances et stages récents dans les métiers du développement et de la data en Île-de-France.",
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
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
