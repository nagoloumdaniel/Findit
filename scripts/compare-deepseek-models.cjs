// Compare deepseek-flash et deepseek-v4-pro sur quatre questions de raisonnement
// portant sur le depot Findit.
//
// Equite du test : les deux modeles recoivent EXACTEMENT le meme contexte (le
// meme ensemble de fichiers, dans le meme ordre) et le meme prompt systeme. Le
// seul ecart mesure est donc le modele. Les fichiers sont fournis plutot que
// laisses a chercher, sinon on mesurerait la chance de tomber sur le bon fichier.
//
// Ce que ca ne mesure pas : Claude Code comme agent. Ici il n'y a ni outils, ni
// boucle d'agent, ni prompt systeme de Claude Code.
//
// Usage : node scripts/compare-deepseek-models.cjs <cle> [filtre]
const fs = require("node:fs");
const path = require("node:path");

const key = process.argv[2];
const only = process.argv[3] ?? null;
// `--dry` mesure le contexte sans appeler les modeles ni exiger de cle.
const DRY = process.argv.includes("--dry");
if (!key && !DRY) {
  console.log(
    "usage : node scripts/compare-deepseek-models.cjs <cle API DeepSeek> [filtre] [--dry]",
  );
  process.exit(2);
}

const REPO = path.resolve(__dirname, "..");
const MODEL_FLASH = "deepseek-flash";
const MODEL_PRO = "deepseek-v4-pro";

const SYSTEM =
  "Tu es un analyste de code. Tu reponds uniquement a partir des fichiers fournis. " +
  "Tu ne devines jamais : un chiffre, un seuil ou un nom de fonction se cite depuis le " +
  "texte. Si une information manque, tu le dis explicitement au lieu de l'inventer. " +
  "Quand une affirmation d'un document ne correspond pas au code, tu le signales.";

// --- constitution du contexte -------------------------------------------------
const ROOTS = ["packages", "apps", "docs"];
const EXTRA_FILES = ["HANDOFF.md", "roadmap.md", "docker-compose.yml", "package.json"];
const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".prisma",
]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
  "coverage",
  ".git",
  ".venv",
  "__pycache__",
  // Le client Prisma genere pese plusieurs mega-octets de types : il noierait le
  // raisonnement sans rien apporter, le schema en clair suffit.
  "generated",
]);
const SKIP_FILE =
  /(pnpm-lock\.yaml|\.env$|\.env\.local|tsconfig\.tsbuildinfo|\.d\.ts$|package-lock)/;
const MAX_FILE_BYTES = 60_000;

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILE.test(entry.name)) continue;
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    const stat = fs.statSync(full);
    if (stat.size > MAX_FILE_BYTES) continue;
    out.push(full);
  }
}

const files = [];
for (const root of ROOTS) walk(path.join(REPO, root), files);
for (const name of EXTRA_FILES) {
  const full = path.join(REPO, name);
  if (fs.existsSync(full)) files.push(full);
}

// Le contexte doit rester proportionne : un test qui envoie un demi-million de
// jetons coute cher pour rien. On garde les sources qui portent la logique et on
// ecarte les donnees de reference volumineuses, sauf si elles sont citees.
const DATA_HEAVY =
  /(communes|geo|schools|ecoles|annuaire|registry|referential|dictionary|dictionnaire|skills|technologies)/i;
const kept = [];
const dropped = [];
for (const file of files) {
  const rel = path.relative(REPO, file).split(path.sep).join("/");
  const size = fs.statSync(file).size;
  // Les fichiers de donnees volumineux sont ecartes : ils noient le raisonnement.
  // La roadmap est aussi ecartee : elle decrit des intentions, pas le code, et
  // elle est longue.
  if ((DATA_HEAVY.test(rel) && size > 20_000) || rel === "roadmap.md") {
    dropped.push({ rel, size });
    continue;
  }
  kept.push(file);
}

if (process.argv.includes("--list")) {
  dropped.sort((a, b) => b.size - a.size);
  console.log("fichiers ecartes (donnees de reference volumineuses) :");
  for (const d of dropped) console.log(`  ${(d.size / 1024).toFixed(0).padStart(6)} Ko  ${d.rel}`);
}

const context = kept
  .map((file) => {
    const rel = path.relative(REPO, file).split(path.sep).join("/");
    return `===== FICHIER ${rel} =====\n${fs.readFileSync(file, "utf8")}`;
  })
  .join("\n\n");

const approxTokens = Math.round(context.length / 3.5);
console.log(
  `contexte : ${kept.length} fichiers gardes, ${dropped.length} ecartes, ` +
    `${context.length} caracteres (~${approxTokens} tokens)`,
);
if (approxTokens > 700_000) {
  console.log("ATTENTION : contexte tres gros, le test peut etre lent ou refuser");
}

if (DRY) {
  console.log("mode --dry : aucun appel de modele effectue");
  process.exit(0);
}

// --- questions ----------------------------------------------------------------
const QUESTIONS = [
  {
    id: "q1",
    titre: "Deduplication : qui decide, quel seuil, quel effet",
    prompt:
      "Dans @findit/job-deduplication puis @findit/job-pipeline, decris precisement ce qui " +
      "se passe quand une offre candidate est jugee dupliquee : qui decide, quelle est la " +
      "valeur exacte du seuil, qu'est-ce qui est ecrit en base, et qu'arrive-t-il a l'offre " +
      "entrante ? Cite les fichiers et les fonctions concernees.",
  },
  {
    id: "q2",
    titre: "Le garde-fou d'acces est-il incontournable",
    prompt:
      "Le registre de conformite affirme qu'un connecteur dont le SourceAccessStatus n'autorise " +
      "pas la collecte ne peut pas s'executer, et que c'est garanti par un type et non par une " +
      "declaration. Montre le mecanisme exact dans le code et explique pourquoi il ne peut pas " +
      "etre contourne par un oubli. Puis dis s'il existe un chemin dans le code qui echappe a ce " +
      "garde-fou, en citant les fichiers.",
  },
  {
    id: "q3",
    titre: "Le budget Apify peut-il etre depasse",
    prompt:
      "La collecte des sources scrapees est desactivee et la garde de budget n'est appelee par " +
      "aucun cycle reel, seulement par un outil de preuve. En supposant qu'on l'allume, decris " +
      "au moins deux scenarios realistes ou le budget peut etre depasse malgre la garde, en te " +
      "fondant sur le code et sur l'etat du registre de conformite. Pour chacun, dis quel fichier " +
      "devrait changer et pourquoi.",
  },
  {
    id: "q4",
    titre: "Une affirmation de la doc est-elle exacte",
    prompt:
      "HANDOFF.md affirme que la fenetre publique par defaut est de 3 jours et que le tri va du " +
      "plus recent au plus ancien. Verifie cette affirmation dans le code. Reponds par EXACTE, " +
      "INCOMPLETE ou FAUSSE, puis donne les preuves (fichiers et valeurs). Si la valeur reelle " +
      "differe, donne-la.",
  },
];

// --- execution ----------------------------------------------------------------
async function ask(model, question) {
  const started = Date.now();
  try {
    const res = await fetch("https://api.deepseek.com/anthropic/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": key,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Voici le depot Findit.\n\n${context}\n\n===== QUESTION =====\n${question.prompt}`,
          },
        ],
      }),
    });
    const text = await res.text();
    const ms = Date.now() - started;
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ms,
        status: res.status,
        answer: `(reponse illisible) ${text.slice(0, 200)}`,
        usage: {},
      };
    }
    const answer = (parsed.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();
    return { ms, status: res.status, answer, usage: parsed.usage ?? {}, modelServed: parsed.model };
  } catch (err) {
    return {
      ms: Date.now() - started,
      status: 0,
      answer: `(erreur reseau) ${err.message}`,
      usage: {},
    };
  }
}

(async () => {
  const selected = QUESTIONS.filter((q) => !only || q.id === only);
  const report = [];

  for (const question of selected) {
    console.log(`\n${"=".repeat(78)}\n${question.id} - ${question.titre}\n${"=".repeat(78)}`);
    for (const model of [MODEL_FLASH, MODEL_PRO]) {
      const r = await ask(model, question);
      console.log(
        `\n--- ${model} : HTTP ${r.status} | ${(r.ms / 1000).toFixed(1)} s | ` +
          `entree ${r.usage.input_tokens ?? "?"} tok | sortie ${r.usage.output_tokens ?? "?"} tok ---`,
      );
      console.log(r.answer || "(reponse vide)");
      report.push({ question: question.id, model, ms: r.ms, usage: r.usage, answer: r.answer });
    }
  }

  // Le rapport vit hors du depot : il ne doit pas apparaitre dans git status.
  const outFile = path.join(require("node:os").tmpdir(), "compare-deepseek-report.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nrapport complet ecrit dans ${outFile}`);

  console.log("\n=== recapitulatif ===");
  for (const question of selected) {
    for (const model of [MODEL_FLASH, MODEL_PRO]) {
      const own = report.filter((r) => r.question === question.id && r.model === model);
      for (const r of own) {
        console.log(
          `${question.id} ${model.padEnd(16)} ${(r.ms / 1000).toFixed(1)}s  ` +
            `sortie ${String(r.usage.output_tokens ?? "?").padStart(5)} tok`,
        );
      }
    }
  }
})();
