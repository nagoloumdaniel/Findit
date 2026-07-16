import type { ReactNode } from "react";

export type PageShellProps = Readonly<{ children: ReactNode }>;

export const PageShell = ({ children }: PageShellProps) => (
  <main className="page-shell">{children}</main>
);
