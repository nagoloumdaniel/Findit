import type { Metadata } from "next";
import type { ReactNode } from "react";

/// Écran de connexion : jamais indexé.
export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
