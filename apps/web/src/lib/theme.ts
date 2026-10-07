/*
 * Thème d'affichage : trois préférences pour deux thèmes résolus.
 *
 * Le POURQUOI de ce module : la préférence est lue à trois moments différents —
 * par le script bloquant du `<head>` (avant le premier rendu), par le sélecteur
 * au montage, et par l'écoute du système quand la préférence est « système ».
 * Une seule définition de la clé, du type et de la règle de résolution évite que
 * ces trois lectures divergent.
 *
 * Le choix explicite ('light' | 'dark') est stocké tel quel ; 'system' reste
 * stocké comme tel et se résout à la lecture. Ainsi, une personne qui choisit
 * « système » suit les changements de son ordinateur sans revenir au sélecteur.
 */

export const THEME_STORAGE_KEY = "findit-theme";

export type ThemePreference = "light" | "dark" | "system";

export type ResolvedTheme = "light" | "dark";

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

/** Vrai quand le système demande un thème sombre. */
export const prefersDarkTheme = (): boolean =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveTheme = (preference: ThemePreference, systemIsDark: boolean): ResolvedTheme =>
  preference === "system" ? (systemIsDark ? "dark" : "light") : preference;

/** Préférence stockée, ou « système » : c'est le défaut du propriétaire. */
export const readStoredPreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    // Navigation privée ou stockage refusé : le thème système reste appliqué.
    return "system";
  }
};

/**
 * Préférence déjà appliquée au document par le script anti-flash, ou à défaut
 * celle du stockage. Le sélecteur s'aligne ainsi sur ce qui est affiché, sans
 * relire le stockage et risquer un état différent de l'écran.
 */
export const readAppliedPreference = (): ThemePreference => {
  const applied = document.documentElement.dataset.themePreference;
  return isThemePreference(applied) ? applied : readStoredPreference();
};

/*
 * `motion.css` ne transitionne les couleurs que pendant la bascule : la classe
 * est posée avant le changement d'attribut, puis retirée après la transition.
 * Sans ce retrait, chaque survol de l'application deviendrait une transition.
 */
const SWITCH_CLASS = "motion-theme-switch";
const SWITCH_CLEANUP_MS = 240;

let switchTimer: number | undefined;

const beginSwitch = (): void => {
  const root = document.documentElement;
  root.classList.add(SWITCH_CLASS);
  window.clearTimeout(switchTimer);
  switchTimer = window.setTimeout(() => {
    root.classList.remove(SWITCH_CLASS);
  }, SWITCH_CLEANUP_MS);
};

/** Applique un thème déjà résolu (le système a changé, la préférence non). */
export const applyResolvedTheme = (resolved: ResolvedTheme): void => {
  beginSwitch();
  document.documentElement.dataset.theme = resolved;
};

/** Applique une préférence, la mémorise, et rend le thème résolu. */
export const applyThemePreference = (preference: ThemePreference): ResolvedTheme => {
  const resolved = resolveTheme(preference, prefersDarkTheme());
  beginSwitch();
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Le thème s'applique quand même : seule la mémoire de session manque.
  }
  return resolved;
};

/*
 * Script bloquant du `<head>` : il pose l'attribut sur `<html>` avant le premier
 * rendu. Sans lui, la page s'affiche en clair puis bascule — plus laid que pas
 * de thème du tout, et c'est un vrai flash sur une connexion lente.
 *
 * Écrit en une ligne et sans dépendance : il s'exécute avant tout le reste, y
 * compris avant que React n'ait monté quoi que ce soit.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var p=s==="light"||s==="dark"?s:"system";var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.dataset.theme=p==="system"?(d?"dark":"light"):p;e.dataset.themePreference=p;}catch(e){}})();`;
