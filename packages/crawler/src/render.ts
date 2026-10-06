import type { Browser } from "playwright";

import type { RenderedPage } from "./types.js";

/**
 * Repli navigateur pour les pages JavaScript.
 *
 * Playwright n'est chargé qu'au premier rendu, et le navigateur n'est lancé
 * qu'à ce moment-là. Une page servie entièrement par le serveur ne paie donc
 * jamais le coût du navigateur, ni son téléchargement de binaires.
 */

export interface PageRenderer {
  render(url: string): Promise<RenderedPage>;
  close(): Promise<void>;
}

/**
 * Construit le rendu Playwright headless. Le navigateur est partagé entre les
 * pages d'un même crawl : le lancer coûte cher, le réutiliser ne coûte rien.
 */
export const createPlaywrightRenderer = (): PageRenderer => {
  let browserPromise: Promise<Browser> | null = null;

  return {
    async render(url: string): Promise<RenderedPage> {
      const { chromium } = await import("playwright");
      browserPromise ??= chromium.launch({ headless: true });
      const browser = await browserPromise;

      const page = await browser.newPage();
      try {
        // On attend le DOM, pas le réseau entier : la page est assez rendue
        // quand son squelette est là, inutile d'attendre chaque image ou pixel.
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const status = response?.status() ?? 0;
        const html = await page.content();
        const text = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        return { html, text, status };
      } finally {
        await page.close();
      }
    },

    async close(): Promise<void> {
      if (browserPromise === null) {
        return;
      }
      const browser = await browserPromise;
      await browser.close();
    },
  };
};
