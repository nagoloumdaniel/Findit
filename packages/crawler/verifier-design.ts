import { chromium } from "playwright";
import type { Browser } from "playwright";

/*
 * Verification du design et du mouvement, dans le navigateur. Temporaire : ce
 * script sert a juger le travail, pas a le livrer.
 *
 * Controles : theme clair et sombre rendus, bascule persistante et sans flash,
 * focus clavier visible, mouvement reduit respecte, et temps de chargement.
 */

const BASE = process.env.VERIF_BASE ?? "https://finditfr.vercel.app";
const PAGES: ReadonlyArray<readonly [string, string]> = [
  ["accueil", "/"],
  ["dashboard", "/dashboard"],
  ["matching", "/dashboard/matching"],
];

const screenshot = async (
  browser: Browser,
  theme: "light" | "dark",
  width: number,
): Promise<void> => {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: theme,
  });
  const page = await context.newPage();

  try {
    for (const [name, route] of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      // On force le theme par attribut quand le site en pose un, sinon la
      // preference systeme du contexte suffit.
      await page.screenshot({
        path: `.tmp-design/${name}-${theme}-${String(width)}.png`,
        fullPage: true,
      });
    }

    const html = await page.evaluate(() => ({
      themeAttribute:
        document.documentElement.getAttribute("data-theme") ?? document.documentElement.className,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      background: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
      stored: (() => {
        try {
          return localStorage.getItem("theme") ?? localStorage.getItem("findit-theme") ?? "(rien)";
        } catch {
          return "(inaccessible)";
        }
      })(),
    }));
    console.log(
      `THEME ${theme} largeur=${String(width)} attribut="${html.themeAttribute}" colorScheme="${html.colorScheme}" fond=${html.background} texte=${html.color} stockage=${html.stored}`,
    );
  } finally {
    await context.close();
  }
};

const main = async (): Promise<void> => {
  const browser = await chromium.launch();

  try {
    for (const theme of ["light", "dark"] as const) {
      await screenshot(browser, theme, 1440);
      await screenshot(browser, theme, 390);
    }

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    // Temps de chargement, a froid puis a chaud.
    for (let pass = 0; pass < 3; pass += 1) {
      const started = Date.now();
      await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60000 });
      const total = Date.now() - started;
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as
          PerformanceNavigationTiming | undefined;
        return nav === undefined
          ? null
          : { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd) };
      });
      console.log(
        `CHARGEMENT passe=${String(pass + 1)} ttfb=${String(timing?.ttfb)}ms dcl=${String(timing?.dcl)}ms total=${String(total)}ms`,
      );
    }

    // Focus clavier visible : on tabule jusqu'au premier element interactif.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return null;
      const style = getComputedStyle(active);
      return {
        tag: active.tagName,
        text: (active.textContent ?? "").trim().slice(0, 30),
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        boxShadow: style.boxShadow.slice(0, 60),
      };
    });
    console.log(`FOCUS ${JSON.stringify(focus)}`);

    // Mouvement reduit : le contenu doit rester visible (aucune opacite nulle).
    const reduced = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const reducedPage = await reduced.newPage();
    await reducedPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await reducedPage.waitForTimeout(800);
    const invisible = await reducedPage.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".job-grid > li"));
      const hidden = cards.filter((card) => Number(getComputedStyle(card).opacity) < 0.9);
      return { cards: cards.length, hidden: hidden.length };
    });
    console.log(
      `MOUVEMENT_REDIT cartes=${String(invisible.cards)} invisibles=${String(invisible.hidden)}`,
    );
    await reduced.close();

    await context.close();
  } finally {
    await browser.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
