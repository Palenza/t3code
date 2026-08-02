#!/usr/bin/env node
/**
 * GARDE DES ORPHELINS — un module que seul son propre test consomme.
 *
 * ── Le mode de panne ──────────────────────────────────────────────────────
 *
 * `orchestrationRecovery.ts` porte une machine de reprise complète : détection
 * de trou de séquence, replay, backoff, abandon après N essais sans progrès.
 * Quarante assertions la couvrent. Elle est verte à chaque CI.
 *
 * Elle n'est appelée par RIEN depuis que « Rewrite client connection
 * architecture » (#2978) a supprimé `packages/client-runtime/src/
 * environmentConnection.ts`, son unique consommateur. Le module a survécu, ses
 * tests aussi, et plus personne ne l'exécute en production.
 *
 * C'est le pire des états, pire que du code mort franc : un lecteur — humain
 * ou agent — ouvre le fichier, voit la logique ET les tests verts, et conclut
 * que le comportement est livré. Il construira sa décision suivante dessus.
 *
 * ── Pourquoi knip ne le voit pas ──────────────────────────────────────────
 *
 * Pour un détecteur de code mort, un import EST un usage — et le fichier de
 * test en fait un. Le module n'est donc jamais « inutilisé ». C'est l'angle
 * mort exact que ce garde couvre : on ne demande pas « quelqu'un
 * l'importe-t-il ? » mais « quelqu'un d'AUTRE QUE SON TEST l'importe-t-il ? ».
 *
 * ── Un CLIQUET, pas un mur ────────────────────────────────────────────────
 *
 * La détection des points d'entrée (bin, exports, config, routes) n'est jamais
 * parfaite : `bin.ts` n'est importé par personne et c'est normal. Plutôt que
 * de prétendre trancher, on fige la liste du jour et on refuse qu'elle
 * GRANDISSE. Les faux positifs d'aujourd'hui sont neutralisés une fois pour
 * toutes ; toute nouvelle apparition, elle, est un vrai signal.
 *
 * Le cliquet ne monte jamais. Il descend quand on répare.
 *
 *   node scripts/garde-orphelins.mjs              → vérifie
 *   node scripts/garde-orphelins.mjs --maj-baseline → abaisse le cliquet
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const RACINE = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const BASELINE = NodePath.join(RACINE, "scripts", "garde-orphelins.baseline.json");
const ZONES = [
  "apps/web/src",
  "apps/server/src",
  "apps/desktop/src",
  "packages/client-runtime/src",
  "packages/shared/src",
];

const EST_TEST = /\.(test|spec)\.tsx?$/;

function* fichiersTs(dossier) {
  let entrees;
  try {
    entrees = NodeFS.readdirSync(dossier, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entree of entrees) {
    const chemin = NodePath.join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === "node_modules" || entree.name === "dist") continue;
      yield* fichiersTs(chemin);
    } else if (/\.tsx?$/.test(entree.name) && !entree.name.endsWith(".d.ts")) {
      yield chemin;
    }
  }
}

/**
 * Les spécificateurs importés par un fichier.
 *
 * On lit les VRAIS imports, pas une sous-chaîne : chercher le nom du module
 * dans le texte attrape les mentions en commentaire et les noms qui se
 * contiennent l'un l'autre (« Suggestion » ⊂ « SuggestionPanel »).
 */
function importsDe(texte) {
  const sortie = [];
  const motifs = [
    /\bfrom\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\bexport\s+[^;]*?\bfrom\s+["']([^"']+)["']/gu,
  ];
  for (const motif of motifs) {
    for (const trouve of texte.matchAll(motif)) {
      if (trouve[1] !== undefined) sortie.push(trouve[1]);
    }
  }
  return sortie;
}

/** Résout un spécificateur relatif vers un chemin de fichier du dépôt. */
function resoudre(depuis, specificateur) {
  if (!specificateur.startsWith(".")) return null;
  const base = NodePath.resolve(NodePath.dirname(depuis), specificateur).replace(/\.tsx?$/, "");
  for (const suffixe of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidat = `${base}${suffixe}`;
    if (NodeFS.existsSync(candidat)) return candidat;
  }
  return null;
}

const fichiers = ZONES.flatMap((zone) => [...fichiersTs(NodePath.join(RACINE, zone))]);
if (fichiers.length < 500) {
  console.error(
    `garde-orphelins : seulement ${fichiers.length} fichiers trouvés — les zones ont bougé ?`,
  );
  console.error("Un compte anormalement bas rendrait « zéro orphelin », vert et mensonger.");
  process.exit(1);
}

const textes = new Map();
for (const fichier of fichiers) {
  try {
    textes.set(fichier, NodeFS.readFileSync(fichier, "utf8"));
  } catch {
    textes.set(fichier, "");
  }
}

/** Qui importe quoi — en chemins résolus, jamais en noms. */
const consommateursDeCode = new Map();
const consommateursDeTest = new Map();
for (const [fichier, texte] of textes) {
  const cible = EST_TEST.test(fichier) ? consommateursDeTest : consommateursDeCode;
  for (const specificateur of importsDe(texte)) {
    const resolu = resoudre(fichier, specificateur);
    if (resolu === null || resolu === fichier) continue;
    if (!cible.has(resolu)) cible.set(resolu, new Set());
    cible.get(resolu).add(fichier);
  }
}

const orphelins = [];
for (const fichier of fichiers) {
  if (EST_TEST.test(fichier)) continue;
  const parCode = consommateursDeCode.get(fichier)?.size ?? 0;
  const parTest = consommateursDeTest.get(fichier)?.size ?? 0;
  if (parCode === 0 && parTest > 0) orphelins.push(NodePath.relative(RACINE, fichier));
}
orphelins.sort();

const majBaseline = process.argv.includes("--maj-baseline");
if (majBaseline) {
  NodeFS.writeFileSync(BASELINE, `${JSON.stringify({ orphelins }, null, 2)}\n`);
  console.log(`garde-orphelins : cliquet posé à ${orphelins.length} orphelin(s).`);
  process.exit(0);
}

let connus = [];
if (NodeFS.existsSync(BASELINE)) {
  try {
    connus = JSON.parse(NodeFS.readFileSync(BASELINE, "utf8")).orphelins ?? [];
  } catch {
    console.error("garde-orphelins : baseline illisible — on refuse de conclure sans référence.");
    process.exit(1);
  }
} else {
  console.error("garde-orphelins : aucune baseline. Poser le cliquet : --maj-baseline");
  process.exit(1);
}

const nouveaux = orphelins.filter((o) => !connus.includes(o));
const repares = connus.filter((o) => !orphelins.includes(o));

console.log(
  `garde-orphelins : ${orphelins.length} orphelin(s) (cliquet ${connus.length}) · ${nouveaux.length} nouveau(x) · ${repares.length} sorti(s)`,
);
if (repares.length > 0) {
  console.log(`  📉 ${repares.length} réparé(s) — abaisse le cliquet : --maj-baseline`);
}
if (nouveaux.length === 0) process.exit(0);

console.log("");
console.log("⛔ NOUVEL ORPHELIN — un module que seul son propre test consomme :");
for (const nouveau of nouveaux) console.log(`  ✗ ${nouveau}`);
console.log("");
console.log("Ses tests seront VERTS et son comportement ne sera livré nulle part.");
console.log("Le brancher, le supprimer, ou — si c'est un point d'entrée — --maj-baseline.");
process.exit(1);
