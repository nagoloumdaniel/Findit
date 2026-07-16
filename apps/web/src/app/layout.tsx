import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

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
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
