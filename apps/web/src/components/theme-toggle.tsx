"use client";

import { useEffect, useState } from "react";

import { applyResolvedTheme, applyThemePreference, readAppliedPreference } from "../lib/theme";
import type { ThemePreference } from "../lib/theme";

/*
 * Sélecteur de thème : trois états, un contrôle segmenté.
 *
 * Le POURQUOI de cases radio natives plutôt que de boutons : la navigation au
 * clavier (Tab, puis flèches dans le groupe) et l'annonce « 2 sur 3 » sont
 * fournies par le navigateur, pas réimplémentées. Le cliché soleil/lune est
 * écarté : le libellé dit l'état, il ne le symbolise pas.
 *
 * Aucune couleur n'est écrite ici : le segment actif est un jeton (--fg sur
 * --bg), donc le contrôle suit les deux thèmes sans règle dédiée.
 */

const OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Système" },
];

export const ThemeToggle = () => {
  /*
   * Le serveur ne connaît pas la préférence, qui vit dans le navigateur : le
   * premier rendu montre « système », puis le montage s'aligne sur ce que le
   * script du `<head>` a déjà appliqué. Sans cet alignement, l'état affiché et le
   * thème réel pourraient diverger.
   */
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(readAppliedPreference());
  }, []);

  /* Préférence « système » : suivre le changement d'apparence de l'ordinateur. */
  useEffect(() => {
    if (preference !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncWithSystem = (): void => {
      applyResolvedTheme(media.matches ? "dark" : "light");
    };

    media.addEventListener("change", syncWithSystem);
    return () => {
      media.removeEventListener("change", syncWithSystem);
    };
  }, [preference]);

  return (
    <div className="theme-dock">
      <fieldset className="theme-toggle">
        <legend className="visually-hidden">Thème d’affichage</legend>
        {OPTIONS.map((option) => (
          <label key={option.value} className="theme-toggle-option">
            <input
              className="theme-toggle-input"
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => {
                applyThemePreference(option.value);
                setPreference(option.value);
              }}
            />
            <span className="theme-toggle-label">{option.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
};
