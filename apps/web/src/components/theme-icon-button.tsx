"use client";

import { useEffect, useState } from "react";

import { applyThemePreference } from "../lib/theme";
import type { ResolvedTheme } from "../lib/theme";

/*
 * Bascule clair/sombre en une icône : la lune quand le thème est clair (clic →
 * sombre), le soleil quand il est sombre (clic → clair). Le script anti-flash du
 * `<head>` a déjà posé le thème, l'icône s'aligne dessus au montage.
 */
export const ThemeIconButton = () => {
  const [theme, setTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = (): void => {
    const next: ResolvedTheme = theme === "dark" ? "light" : "dark";
    applyThemePreference(next);
    setTheme(next);
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="navbar-theme"
      onClick={toggle}
      aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
      title={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
};
