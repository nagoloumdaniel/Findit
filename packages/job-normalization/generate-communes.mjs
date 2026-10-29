import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Génère la table des communes de France à partir de l'API officielle du
 * gouvernement français.
 *
 * La table est générée puis commitée plutôt qu'interrogée à l'exécution : la
 * liste des communes ne change qu'à la marge, et une dépendance réseau au
 * moment de classer une offre serait un point de panne pour rien. À rejouer
 * quand le découpage communal change.
 *
 * Deux communes peuvent porter le même nom (il y en a des milliers en France).
 * Un nom unique vaut son département ; un nom porté par plusieurs communes vaut
 * AMBIGUOUS, sauf s'il n'est ambigu qu'hors Île-de-France : il garde alors son
 * département francilien, qui est l'usage historique de la plateforme.
 *
 *   node generate-communes.mjs
 */
const DEPARTMENTS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "2A",
  "2B",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "50",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "59",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "70",
  "71",
  "72",
  "73",
  "74",
  "75",
  "76",
  "77",
  "78",
  "79",
  "80",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "971",
  "972",
  "973",
  "974",
  "976",
];
const ILE_DE_FRANCE = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);
const USER_AGENT = "FinditBot/0.1 (+https://github.com/nagoloumdaniel/Findit)";

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
      byName.set(key, { departments: new Set([department]), name: commune.nom });
    } else {
      existing.departments.add(department);
    }
  }

  process.stdout.write(`\r${department} (${byName.size} communes)`);
}

process.stdout.write("\n");

/** Résout un nom vers un département, ou AMBIGUOUS. */
const resolveDepartment = ({ departments }) => {
  const list = [...departments];
  if (list.length === 1) {
    return list[0];
  }

  // Un nom unique en Île-de-France garde son département francilien, même s'il
  // existe ailleurs en France : c'est l'usage historique de la plateforme.
  const idf = list.filter((department) => ILE_DE_FRANCE.has(department));
  return idf.length === 1 ? idf[0] : "AMBIGUOUS";
};

const entries = [...byName.entries()]
  .map(([key, value]) => [key, resolveDepartment(value), value.name])
  .sort(([a], [b]) => a.localeCompare(b));
const ambiguous = entries.filter(([, department]) => department === "AMBIGUOUS");

const lines = entries.map(([key, department, name]) => `  ["${key}", "${department}"], // ${name}`);

const file = `/*
 * Table générée par \`generate-communes.mjs\` le ${new Date().toISOString().slice(0, 10)},
 * depuis geo.api.gouv.fr - l'API officielle du découpage administratif français.
 * Ne pas modifier à la main : rejouer le script.
 *
 * ${entries.length} communes de France, dont ${ambiguous.length} dont le nom est porté par
 * plusieurs départements hors Île-de-France. Celles-là valent \`AMBIGUOUS\` : le
 * libellé d'une offre ne suffit pas à les départager, et deviner le département
 * reviendrait à inventer la localisation. Un nom ambigu en France mais unique
 * en Île-de-France garde son département francilien.
 *
 * La clé est le nom normalisé - sans accent, sans apostrophe, sans tiret - parce
 * que les offres écrivent « Boulogne-Billancourt », « Boulogne Billancourt » et
 * « boulogne billancourt » pour la même ville.
 */
export type CommuneDepartment = string;

export const FRANCE_COMMUNES: ReadonlyMap<string, CommuneDepartment> = new Map([
${lines.join("\n")}
]);
`;

const target = fileURLToPath(new URL("src/france-communes.ts", import.meta.url));
writeFileSync(target, file, "utf8");

console.log(`${entries.length} communes écrites dans src/france-communes.ts`);
console.log(`dont ambiguës : ${ambiguous.length}`);
