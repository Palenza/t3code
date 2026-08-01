// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Outil de vérification
// lancé à la main après un build : il monte un volume, lit un plist et écrit sur la
// sortie standard. Aucune de ces trois choses n'appartient au runtime de l'app, et
// l'envelopper dans Effect ajouterait une couche pour un problème qu'on n'a pas.

/**
 * Vérifie un DMG construit, et REFUSE de rendre un verdict ambigu.
 *
 * LE PIÈGE, mordu deux fois (0.0.71 le 01/08, 0.0.73 le 02/08) : quand un
 * montage précédent traîne, macOS suffixe le nouveau volume (« … 1 »), et le
 * PREMIER porte l'application mais PAS son `Info.plist`. Une lecture naïve y
 * trouve une version vide et des compteurs à zéro — et un zéro crédible se
 * cite. La première fois, j'ai annoncé une version fausse sur ce zéro-là.
 *
 * Ici : on démonte tout ce qui traîne AVANT de monter, on retient le point de
 * montage que `hdiutil` ANNONCE (jamais celui qu'on devine), et on sort en
 * erreur si le volume obtenu n'a pas d'`Info.plist` — au lieu de deviner.
 *
 * Usage : node scripts/verifier-dmg.ts <chemin.dmg> [--ouvrir] [marqueur ...]
 * Les marqueurs sont des chaînes du travail du jour ; leur absence de
 * l'`app.asar` est un ÉCHEC, pas un détail.
 *
 * `--ouvrir` pose la fenêtre du DMG à l'écran une fois la vérification PASSÉE.
 * C'est un seul geste par nécessité : la vérification démonte les volumes en
 * partant, donc ouvrir d'abord puis vérifier referme la fenêtre sous le nez
 * d'Enzo — ce qui vient d'arriver le 02/08. Et ouvrir sans avoir vérifié, ce
 * serait lui livrer un artefact dont on ne sait rien.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const CODES = {
  dmgIntrouvable: 2,
  montageImpossible: 3,
  aucuneApp: 4,
  volumeIncomplet: 5,
  versionDiscordante: 6,
  marqueurAbsent: 7,
} as const;

function echouer(code: number, message: string): never {
  console.error(`✗ ${message}`);
  process.exit(code);
}

/** Silencieux par nature : démonter un volume déjà absent n'est pas une erreur. */
function demonter(point: string): void {
  try {
    execFileSync("hdiutil", ["detach", point, "-quiet", "-force"], { stdio: "ignore" });
  } catch {
    // Rien à démonter, ou déjà parti.
  }
}

const arguments_ = process.argv.slice(2);
const ouvrirEnsuite = arguments_.includes("--ouvrir");
const [dmg, ...marqueurs] = arguments_.filter((valeur) => valeur !== "--ouvrir");
if (dmg === undefined) {
  echouer(CODES.dmgIntrouvable, "usage : verifier-dmg.ts <chemin.dmg> [marqueur ...]");
}
if (!existsSync(dmg)) {
  echouer(CODES.dmgIntrouvable, `DMG introuvable : ${dmg}`);
}

const versionAttendue = /-(\d+\.\d+\.\d+)-/u.exec(basename(dmg))?.[1];
if (versionAttendue === undefined) {
  echouer(CODES.dmgIntrouvable, `le nom « ${basename(dmg)} » ne porte pas de version lisible`);
}

// 1 · Les restes. Un montage de DMG est en lecture seule : le démonter ne peut
//     rien détruire, et c'est ce qui rend la suite lisible.
for (const entree of readdirSync("/Volumes")) {
  if (!entree.includes(versionAttendue)) continue;
  console.log(`… démontage d'un reste : /Volumes/${entree}`);
  demonter(join("/Volumes", entree));
}

// 2 · Monter UNE fois, et croire hdiutil sur le point de montage.
const sortie = execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", dmg], {
  encoding: "utf8",
});
const point = sortie
  .split("\n")
  .map((ligne) => ligne.split("\t").at(-1)?.trim() ?? "")
  .filter((chemin) => chemin.startsWith("/Volumes/"))
  .at(-1);
if (point === undefined || !existsSync(point)) {
  echouer(CODES.montageImpossible, "le montage n'a rendu aucun point de montage utilisable");
}
process.on("exit", () => demonter(point));

const app = readdirSync(point)
  .filter((entree) => entree.endsWith(".app"))
  .map((entree) => join(point, entree))
  .find((chemin) => statSync(chemin).isDirectory());
if (app === undefined) {
  echouer(CODES.aucuneApp, `aucune application dans ${point}`);
}

const plist = join(app, "Contents", "Info.plist");
if (!existsSync(plist)) {
  echouer(
    CODES.volumeIncomplet,
    `VOLUME INCOMPLET : ${point} porte l'app mais pas son Info.plist.\n` +
      "  C'est le piège du double montage. Ne lis SURTOUT pas de version ici.",
  );
}

const version = execFileSync("plutil", ["-extract", "CFBundleShortVersionString", "raw", plist], {
  encoding: "utf8",
}).trim();
const binaire = join(app, "Contents", "MacOS", basename(app, ".app"));
let archs = "?";
try {
  archs = execFileSync("lipo", ["-archs", binaire], { encoding: "utf8" }).trim();
} catch {
  // `lipo` refuse un binaire non universel selon la version : on le dit, on ne ment pas.
}

console.log(`volume   ${point}`);
console.log(`version  ${version}`);
console.log(`arch     ${archs}`);

if (version !== versionAttendue) {
  echouer(
    CODES.versionDiscordante,
    `la version LUE (${version}) ne vaut pas celle du nom de fichier (${versionAttendue})`,
  );
}

// 3 · Les marqueurs : la seule preuve que le binaire contient ce qu'on croit y
//     avoir mis. `strings` sur l'asar, parce que c'est ce que le binaire EMBARQUE.
const asar = join(app, "Contents", "Resources", "app.asar");

let manquants = 0;
for (const marqueur of marqueurs) {
  let compte = 0;
  try {
    const trouve = execFileSync("bash", [
      "-c",
      `strings -a ${JSON.stringify(asar)} | grep -c -- ${JSON.stringify(marqueur)}`,
    ]);
    compte = Number.parseInt(trouve.toString().trim(), 10) || 0;
  } catch {
    compte = 0;
  }
  console.log(`  ${marqueur.padEnd(28)} ${compte}`);
  if (compte === 0) manquants += 1;
}

if (manquants > 0) {
  echouer(
    CODES.marqueurAbsent,
    `${manquants} marqueur(s) ABSENT(S) du binaire — il ne contient pas ce travail`,
  );
}

console.log("✓ artefact vérifié");
