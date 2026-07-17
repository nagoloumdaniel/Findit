import { loadRootEnv, parseDatabaseEnv } from "@findit/config";
import { createPrismaClient } from "@findit/database";

import { CONNECTOR_REGISTRY_ENTRIES, syncConnectorRegistry } from "./src/registry.js";

/*
 * Reporte docs/legal-compliance.md en base. À rejouer après toute modification
 * du registre : c'est la base que lit le garde-fou, pas le document.
 */
const main = async (): Promise<void> => {
  loadRootEnv();

  const prisma = createPrismaClient(parseDatabaseEnv(process.env).DATABASE_URL);

  try {
    const count = await syncConnectorRegistry(prisma);

    console.log(`Registre reporté en base : ${String(count)} sources.`);
    for (const entry of CONNECTOR_REGISTRY_ENTRIES) {
      const checked = entry.termsCheckedAt?.toISOString().slice(0, 10) ?? "jamais vérifié";
      console.log(`  ${entry.name.padEnd(22)} ${entry.status.padEnd(30)} ${checked}`);
    }
  } finally {
    await prisma.$disconnect();
  }
};

await main();
