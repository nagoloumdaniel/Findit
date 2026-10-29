import type { Metadata } from "next";
import type { ReactNode } from "react";

/// Connexion à l'espace personnel : jamais indexée.
export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false, follow: false },
};

export default function ConnexionLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
