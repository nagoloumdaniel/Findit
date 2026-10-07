import { chromium } from "playwright";

/*
 * Mesure des temps de chargement reels (avant/apres). Temporaire.
 * On releve ce que l'utilisateur ressent : le temps avant le premier octet, le
 * temps avant le plus grand element visible, et le temps total.
 */
const ROUTES = ["/", "/dashboard/matching", "/moi"];

const main = async (): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    for (const route of ROUTES) {
      // Un passage a froid (contexte neuf) puis deux a chaud.
      for (let pass = 0; pass < 3; pass += 1) {
        const started = Date.now();
        const response = await page.goto(`https://finditfr.vercel.app${route}`, {
          waitUntil: "load",
          timeout: 60000,
        });
        const total = Date.now() - started;

        const timing = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0] as
            PerformanceNavigationTiming | undefined;
          const lcp = performance.getEntriesByType("largest-contentful-paint").at(-1) as
            { startTime?: number } | undefined;
          return {
            ttfb: nav === undefined ? null : Math.round(nav.responseStart),
            domContentLoaded: nav === undefined ? null : Math.round(nav.domContentLoadedEventEnd),
            load: nav === undefined ? null : Math.round(nav.loadEventEnd),
            lcp: lcp?.startTime === undefined ? null : Math.round(lcp.startTime),
          };
        });

        console.log(
          `MESURE ${route} passe=${String(pass + 1)} statut=${String(response?.status())} ttfb=${String(timing.ttfb)}ms dcl=${String(timing.domContentLoaded)}ms load=${String(timing.load)}ms lcp=${String(timing.lcp)}ms total=${String(total)}ms`,
        );
      }
    }
  } finally {
    await browser.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
