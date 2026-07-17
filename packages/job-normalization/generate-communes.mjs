import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Génère la table des communes d'Île-de-France à partir de l'API officielle du
 * gouvernement français.
 *
 * La table est générée puis commitée plutôt qu'interrogée à l'exécution : la
 * liste des communes ne change qu'à la marge, et une dépendance réseau au
 * moment de classer une offre serait un point de panne pour rien. À rejouer
 * quand le découpage communal change.
 *
 *   node generate-communes.mjs
 */
const DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"];
const USER_AGENT = "FinditBot/0.1 (+https://github.com/Nagoloum/Findit)";

/** Doit rester identique à `normalizeCommune` dans location.ts. */
const normalize = (name) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

const byName = new Map();

for (const department of DEPARTMENTS) {
  const response = await fetch(
    `https://geo.api.gouv.fr/departements/${department}/communes?fields=nom`,
    { headers: { "user-agent": USER_AGENT, accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error(
      `geo.api.gouv.fr a répondu ${response.status} pour le département ${department}`,
    );
  }

  const communes = await response.json();
  for (const commune of communes) {
    const key = normalize(commune.nom);
    const existing = byName.get(key);

    if (existing === undefined) {
      byName.set(key, { department, name: commune.nom });
      continue;
    }

    // Deux communes d'Île-de-France portant le même nom : le libellé seul ne
    // permet pas de trancher. Marqué ambigu plutôt que résolu au hasard.
    existing.department = "AMBIGUOUS";
  }
}

const entries = [...byName.entries()].sort(([a], [b]) => a.localeCompare(b));
const ambiguous = entries.filter(([, value]) => value.department === "AMBIGUOUS");

const lines = entries.map(
  ([key, value]) => `  ["${key}", "${value.department}"], // ${value.name}`,
);

const file = `import type { IleDeFranceDepartment } from "@findit/shared";

/*
 * Table générée par \`generate-communes.mjs\` le ${new Date().toISOString().slice(0, 10)},
 * depuis geo.api.gouv.fr — l'API officielle du découpage administratif français.
 * Ne pas modifier à la main : rejouer le script.
 *
 * ${entries.length} communes, dont ${ambiguous.length} dont le nom est porté par
 * deux départements d'Île-de-France. Celles-là valent \`AMBIGUOUS\` : le libellé
 * d'une offre ne suffit pas à les départager, et deviner le département
 * reviendrait à inventer la localisation.
 *
 * La clé est le nom normalisé — sans accent, sans apostrophe, sans tiret — parce
 * que les offres écrivent « Boulogne-Billancourt », « Boulogne Billancourt » et
 * « boulogne billancourt » pour la même ville.
 */
export type CommuneDepartment = IleDeFranceDepartment | "AMBIGUOUS";

export const ILE_DE_FRANCE_COMMUNES: ReadonlyMap<string, CommuneDepartment> = new Map([
${lines.join("\n")}
]);
`;

const target = fileURLToPath(new URL("src/ile-de-france-communes.ts", import.meta.url));
writeFileSync(target, file, "utf8");

console.log(`${entries.length} communes écrites dans src/ile-de-france-communes.ts`);
console.log(
  `dont ambiguës : ${ambiguous.length}${ambiguous.length > 0 ? " — " + ambiguous.map(([k]) => k).join(", ") : ""}`,
);
