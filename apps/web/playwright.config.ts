import { defineConfig, devices } from "@playwright/test";

/*
 * Tests de bout en bout du site public Findit. Le web tourne sur le port 3100,
 * l'API sur 4000 : les deux sont lancés à la main (voir docs/deployment.md), ce
 * fichier ne démarre donc aucun serveur et réutilise l'existant.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Chromium en viewport mobile : plus fiable que WebKit sur Windows, et
      // suffisant pour vérifier le responsive à travers des actions réelles.
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
