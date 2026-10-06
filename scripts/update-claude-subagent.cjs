// Aligne le bundle sous-agent Claude Code sur la version de DeepSeek Harness.
//
// Pourquoi ce script plutot qu'un appel a `dsh plugin` :
//   - le bundle est publie en versions pre-liminaires, et une plage de versions
//     npm ignore les pre-versions. `0.2.0-rc.2` est donc la seule valeur
//     resolvable ; une plage retomberait sur `0.0.1-rc.1`, qui ne declare aucun
//     bundle de profil et ne s'active jamais.
//   - la CLI `dsh` presente dans le PATH est une installation globale qui peut
//     etre plus ancienne que l'application (constate : 0.1.0-rc.8 contre
//     0.2.0-rc.2). C'est la version de l'APPLICATION qui fait foi.
// Apres une mise a jour de DeepSeek Harness, les deux peuvent diverger et le
// profil refuse alors de se charger : ce script les remet en phase.
//
// Il n'installe rien a la main dans le profil : la selection du bundle et
// l'installation passent par la CLI du paquet, en pointant celle de
// l'application quand elle est joignable.
//
// Usage :
//   node scripts/update-claude-subagent.cjs          # aligner
//   node scripts/update-claude-subagent.cjs --check  # constater seulement
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PACKAGE = "@deepseek-ai/dsh-subagent-claude-code";
const PROFILE = process.env.DSH_PROFILE ?? "desktop";
const CHECK = process.argv.includes("--check");

const dshHome = process.env.DSH_HOME ?? path.join(process.env.USERPROFILE, ".dsh");
const profileDir = path.join(dshHome, "profiles", PROFILE);
const profileManifest = path.join(profileDir, "package.json");

const appAsar = path.join(
  process.env.LOCALAPPDATA,
  "Programs",
  "DeepSeek Harness",
  "resources",
  "app.asar",
);

// Lit un fichier dans une archive asar : en-tete JSON, puis contenu a offsets.
function readFromAsar(archive, entry) {
  const fd = fs.openSync(archive, "r");
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(12);
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 16);
    const tree = JSON.parse(headerBuf.toString("utf8"));
    const node = entry.split("/").reduce((acc, key) => acc?.files?.[key], tree);
    if (!node) throw new Error(`entree absente de l'archive : ${entry}`);
    const body = Buffer.alloc(Number(node.size));
    fs.readSync(fd, body, 0, body.length, 16 + headerSize + Number(node.offset));
    return body.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

// On pose un code de sortie plutot que d'appeler process.exit() : quitter pendant
// qu'une requete du registre est encore ouverte declenche une assertion de Node
// sous Windows (UV_HANDLE_CLOSING). StopError sert a remonter la sortie sans la
// confondre avec un vrai bogue.
class StopError extends Error {}

function fail(message) {
  console.log(message);
  process.exitCode = 1;
  throw new StopError(message);
}

// Un manifeste passe par PowerShell peut porter un BOM : JSON.parse le refuse.
// On le retire a la lecture plutot que d'imposer un outil d'ecriture.
function readJson(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

if (!fs.existsSync(appAsar)) fail(`archive de l'application introuvable : ${appAsar}`);
if (!fs.existsSync(profileManifest)) fail(`profil introuvable : ${profileManifest}`);

// L'etat est lu ici, mais l'execution est lancee tout en bas du fichier : `main`
// a besoin de `metaUrl`, et l'appeler avant sa declaration le placerait dans sa
// zone morte temporelle.
const appVersion = JSON.parse(readFromAsar(appAsar, "package.json")).version;
const before = readJson(profileManifest);
const installed = before.dependencies?.[PACKAGE] ?? "(absent)";
const selected = (before.dsh?.profile?.bundles ?? []).includes(PACKAGE);

console.log(`application          : ${appVersion}`);
console.log(`bundle dans le profil: ${installed}`);
console.log(`bundle selectionne   : ${selected ? "oui" : "non"}`);

// Avant de toucher au profil, on s'assure que la version visee existe au registre
// ET qu'elle declare bien un bundle de profil. Installer autre chose laisserait
// une ligne selectionnee sans patch, ce qui empeche le profil de se charger.
const registry = "https://registry.npmjs.org";
const metaUrl = `${registry}/${PACKAGE.replace("/", "%2f")}`;

async function checkVersionExists() {
  try {
    const res = await fetch(metaUrl, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: `registre HTTP ${res.status}` };
    const body = await res.json();
    const manifest = body.versions?.[appVersion];
    if (!manifest) {
      const available = Object.keys(body.versions ?? {});
      return {
        ok: false,
        reason:
          `la version ${appVersion} n'existe pas au registre. ` +
          `Derniere publiee : ${available[available.length - 1]}. ` +
          "L'application a probablement ete mise a jour avant la publication du bundle.",
      };
    }
    if (!manifest.dsh?.bundle?.patch) {
      return {
        ok: false,
        reason:
          `${PACKAGE}@${appVersion} ne declare aucun bundle de profil ` +
          "(champ dsh.bundle.patch absent) : l'installer laisserait une ligne dormante.",
      };
    }
    return { ok: true, patch: manifest.dsh.bundle.patch };
  } catch (err) {
    return { ok: false, reason: `registre injoignable : ${err.message}` };
  }
}

// Le reste passe par une fonction asynchrone : un fichier CommonJS n'accepte pas
// `await` au niveau racine.
async function main() {
  const check = await checkVersionExists();
  if (!check.ok) {
    fail(`\nVerification refusee : ${check.reason}\nProfil laisse intact.`);
  }
  console.log(`\nVersion ${appVersion} verifiee au registre (bundle : ${check.patch}).`);

  if (CHECK) {
    console.log(`A aligner : ${installed} -> ${appVersion}`);
    console.log("Relancez sans --check pour appliquer.");
    return;
  }

  install();
}

// L'installation passe par la CLI du paquet quand elle est joignable dans le
// profil ; sinon par pnpm directement, et on selectionne le bundle nous-memes.
// `dsh plugin` ne fait rien d'autre : il execute pnpm dans le dossier du profil
// et retient la selection a partir du `dsh.bundle` declare par le paquet.
function install() {
  const cliCandidates = [
    path.join(profileDir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    path.join(
      path.dirname(process.execPath),
      "node_modules",
      "@deepseek-ai",
      "dsh",
      "lib",
      "bin.js",
    ),
  ].filter((candidate) => fs.existsSync(candidate));

  const nodeExe = fs.existsSync("C:\\Program Files\\nodejs\\node.exe")
    ? "C:\\Program Files\\nodejs\\node.exe"
    : process.execPath;

  console.log(`\nInstallation de ${PACKAGE}@${appVersion} dans le profil '${PROFILE}'...`);

  let result;
  if (cliCandidates.length > 0) {
    result = spawnSync(
      nodeExe,
      [cliCandidates[0], "plugin", "--profile", PROFILE, "add", `${PACKAGE}@${appVersion}`],
      { stdio: "inherit" },
    );
  } else {
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    result = spawnSync(pnpm, ["add", `${PACKAGE}@${appVersion}`], {
      cwd: profileDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  }

  if (result.status !== 0) fail(`\nInstallation en echec (code ${result.status}).`);

  // La selection du bundle est ce qui rend la ligne active au demarrage : sans
  // elle, le paquet est installe mais dormant. On la pose si elle manque.
  const after = readJson(profileManifest);
  after.dsh ??= {};
  after.dsh.profile ??= {};
  after.dsh.profile.bundles ??= [];
  if (!after.dsh.profile.bundles.includes(PACKAGE)) {
    after.dsh.profile.bundles.push(PACKAGE);
    fs.writeFileSync(profileManifest, `${JSON.stringify(after, null, 2)}\n`, "utf8");
    console.log("Bundle ajoute a dsh.profile.bundles.");
  }

  const finalVersion = after.dependencies?.[PACKAGE];
  const finalSelected = after.dsh.profile.bundles.includes(PACKAGE);

  console.log("");
  if (finalVersion === appVersion && finalSelected) {
    console.log(`Aligne : ${PACKAGE}@${finalVersion}`);
    console.log("Redemarrez DeepSeek Harness pour charger le bundle.");
  } else {
    fail(`Etat inattendu apres installation : version=${finalVersion} selection=${finalSelected}.`);
  }
}

// Point d'entree unique, apres toutes les declarations.
if (installed === appVersion && selected) {
  console.log("\nDeja aligne : rien a faire.");
} else {
  main().catch((err) => {
    // Un arret voulu a deja affiche sa raison et pose le code de sortie.
    if (err instanceof StopError) return;
    fail(`\nErreur inattendue : ${err.message}`);
  });
}
