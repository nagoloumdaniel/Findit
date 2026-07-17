import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadRootEnv } from "@findit/config";

/*
 * Next ne lit que le `.env` de son propre dossier, or le dépôt n'en tient qu'un,
 * à la racine. Et son port est arrêté par la ligne de commande, avant que
 * next.config.ts ne soit chargé : aucune configuration ne peut le changer après
 * coup. Ce lanceur fait les deux — il charge le `.env` de la racine, puis passe
 * le port à Next.
 *
 * Sans lui, WEB_PORT serait une variable que personne ne lit, et
 * NEXT_PUBLIC_API_URL manquerait au moment de la compilation.
 */
loadRootEnv();

const DEFAULT_PORT = "3100";

const command = process.argv[2];
if (command !== "dev" && command !== "build" && command !== "start") {
  console.error("Usage : node run-next.mjs <dev|build|start>");
  process.exit(1);
}

const port = process.env.WEB_PORT ?? DEFAULT_PORT;
const args = command === "build" ? ["build"] : [command, "--hostname", "0.0.0.0", "--port", port];

const nextBin = fileURLToPath(new URL("node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [nextBin, ...args], { stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
