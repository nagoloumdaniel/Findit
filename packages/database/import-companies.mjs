// Importe l'annuaire d'entreprises fourni par le propriétaire dans `Company`
// (nom + site carrière). Idempotent : réimporter met à jour, ne duplique pas.
// Un site carrière enregistré n'est PAS collectable pour autant : la collecte
// reste réservée aux connecteurs du registre de conformité.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createPrismaClient } from "./dist/index.js";

const envText = readFileSync(fileURLToPath(new URL("../../.env", import.meta.url)), "utf8");
const databaseUrl = envText
  .split(/\r?\n/)
  .find((line) => line.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length);
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL introuvable dans le .env racine.");
}
const prisma = createPrismaClient(databaseUrl);

const normalizedName = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

const slugify = (name) =>
  normalizedName(name)
    .replace(/['’]/gu, " ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

const csvPath = fileURLToPath(new URL("./data/employer-directory.csv", import.meta.url));
const lines = readFileSync(csvPath, "utf8")
  .split(/\r?\n/)
  .slice(1)
  .filter((line) => line.includes(";"));

let created = 0;
let updated = 0;
let skipped = 0;
for (const line of lines) {
  const [name, url] = line.split(";").map((part) => part.trim());
  if (!name || !url || !/^https:\/\//.test(url)) {
    skipped += 1;
    continue;
  }
  const slug = slugify(name);
  if (slug === "") {
    skipped += 1;
    continue;
  }
  const existing = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  await prisma.company.upsert({
    where: { slug },
    update: { careerUrl: url },
    create: { slug, name, normalizedName: normalizedName(name), careerUrl: url },
  });
  if (existing === null) {
    created += 1;
  } else {
    updated += 1;
  }
}

console.log(`lignes lues : ${String(lines.length)}`);
console.log(`entreprises creees : ${String(created)}`);
console.log(`entreprises mises a jour : ${String(updated)}`);
console.log(`lignes ignorees (forme invalide) : ${String(skipped)}`);
console.log(`total en base : ${String(await prisma.company.count())}`);

await prisma.$disconnect();
