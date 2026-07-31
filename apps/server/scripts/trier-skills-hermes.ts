/**
 * TRIER LES SKILLS D'HERMÈS — pour qu'Enzo décide sur une liste, pas sur 69
 * inconnues.
 *
 * Chantier n°51. Le catalogue annonçait « les 182 skills », en priorité
 * `software-development`, `github`, `research`, `autonomous-ai-agents`,
 * `mlops`, `security`. Sur disque il y en a **69**, et pas de famille
 * `security` — le chiffre venait du dépôt GitHub, pas de ce qu'on a.
 *
 * Prendre une skill tierce, c'est charger sa description dans CHAQUE session
 * et son corps dès qu'elle se déclenche. On a déjà mesuré ce que ça coûte
 * chez nous : 15 de nos 18 skills dépassent les 240 caractères de
 * description, pour ~8 400 caractères par démarrage. En ajouter 69 sans
 * regarder serait doubler l'addition à l'aveugle.
 *
 * Ce script ne prend AUCUNE décision et ne copie rien. Il applique aux 69 les
 * deux contrôles qu'on a déjà écrits — le scanner de sécurité (n°10) et les
 * normes de forme (n°4) — et rend un tableau. La décision de prendre ou non
 * appartient à Enzo (M2) ; le travail de regarder m'appartient (M6).
 *
 *   node --experimental-strip-types scripts/trier-skills-hermes.ts <racine>
 */

// @effect-diagnostics nodeBuiltinImport:off
// Script hors-runtime : il lit un dossier sur disque et écrit sur stdout, sans
// jamais entrer dans un Effect. Y monter FileSystem/Path ajouterait une couche
// que rien ici ne justifie.
// eslint-disable-next-line t3code/namespace-node-imports
import * as NodeFS from "node:fs";
// eslint-disable-next-line t3code/namespace-node-imports
import * as NodePath from "node:path";

import { scannerSkill, type FichierDeSkill } from "../src/securite/ScanDeSkill.ts";
import { controlerSkill, MAX_DESCRIPTION } from "../src/skills/NormesDeSkill.ts";

const racine = process.argv[2] ?? "";
if (racine.length === 0) {
  process.stderr.write("usage: trier-skills-hermes.ts <dossier de skills>\n");
  process.exit(2);
}

/** Tous les `SKILL.md` sous la racine, avec leur dossier. */
function trouverLesSkills(dossier: string): Array<{ nom: string; dossier: string }> {
  const trouvees: Array<{ nom: string; dossier: string }> = [];
  const descendre = (ou: string) => {
    for (const entree of NodeFS.readdirSync(ou)) {
      const complet = NodePath.join(ou, entree);
      if (NodeFS.statSync(complet).isDirectory()) descendre(complet);
      else if (entree === "SKILL.md")
        trouvees.push({ nom: NodePath.relative(racine, ou), dossier: ou });
    }
  };
  descendre(dossier);
  return trouvees;
}

/** Les fichiers d'une skill, pour le scanner. */
function lireLaSkill(dossier: string): FichierDeSkill[] {
  const fichiers: FichierDeSkill[] = [];
  const descendre = (ou: string) => {
    for (const entree of NodeFS.readdirSync(ou)) {
      const complet = NodePath.join(ou, entree);
      if (NodeFS.statSync(complet).isDirectory()) {
        descendre(complet);
        continue;
      }
      let texte = "";
      try {
        texte = NodeFS.readFileSync(complet, "utf8");
      } catch {
        // Illisible : il entre quand même, le scanner le juge sur son extension.
      }
      fichiers.push({
        nom: NodePath.relative(dossier, complet),
        texte,
        octets: NodeFS.statSync(complet).size,
      });
    }
  };
  descendre(dossier);
  return fichiers;
}

const lignes: Array<{
  nom: string;
  verdict: string;
  decision: string;
  manquements: number;
  erreurs: number;
  description: number;
  fichiers: number;
}> = [];

for (const skill of trouverLesSkills(racine)) {
  const fichiers = lireLaSkill(skill.dossier);
  // Confiance « communauté » : ce sont des skills tierces, c'est le réglage
  // le plus prudent des quatre et le seul honnête ici.
  const scan = scannerSkill(fichiers, "communaute");
  const texte = fichiers.find((f) => f.nom === "SKILL.md")?.texte ?? "";
  const manquements = controlerSkill({ texte });
  const description = /^description:\s*(.*)$/mu.exec(texte)?.[1]?.length ?? 0;

  lignes.push({
    nom: skill.nom,
    verdict: scan.verdict,
    decision: scan.decision,
    manquements: manquements.length,
    erreurs: manquements.filter((m) => m.gravite === "erreur").length,
    description,
    fichiers: fichiers.length,
  });
}

// Mode DÉTAIL : pourquoi telle skill est refusée. Sans lui, « 30 à refuser »
// est un chiffre qu'on croit ou qu'on ignore — jamais qu'on vérifie.
const detail = process.argv[3];
if (detail !== undefined && detail.length > 0) {
  const dossier = NodePath.join(racine, detail);
  const scan = scannerSkill(lireLaSkill(dossier), "communaute");
  process.stdout.write(`${detail}\n  ${scan.verdict} / ${scan.decision}\n`);
  for (const trouvaille of scan.trouvailles) {
    process.stdout.write(
      `  · [${trouvaille.gravite}] ${trouvaille.id} — ${trouvaille.categorie} — ${trouvaille.ou}\n`,
    );
  }
  process.exit(0);
}

lignes.sort((a, b) => b.description - a.description);

const dire = (texte: string) => process.stdout.write(`${texte}\n`);

dire(`${String(lignes.length)} skills lues sous ${racine}\n`);
dire(`${"skill".padEnd(46)} ${"verdict".padEnd(10)} ${"décision".padEnd(9)} desc  norm  fich`);
dire("-".repeat(90));
for (const ligne of lignes) {
  const alerte = ligne.description > MAX_DESCRIPTION ? "!" : " ";
  dire(
    `${ligne.nom.padEnd(46)} ${ligne.verdict.padEnd(10)} ${ligne.decision.padEnd(9)} ` +
      `${String(ligne.description).padStart(4)}${alerte} ${String(ligne.manquements).padStart(4)}  ${String(ligne.fichiers).padStart(4)}`,
  );
}

const total = lignes.reduce((n, l) => n + l.description, 0);
const horsNorme = lignes.filter((l) => l.description > MAX_DESCRIPTION).length;
const refusees = lignes.filter((l) => l.decision === "refuser").length;
const aDemander = lignes.filter((l) => l.decision === "demander").length;

dire("");
dire(
  `Description cumulée : ${String(total)} caractères chargés à CHAQUE session si on prend tout.`,
);
dire(`Au-dessus de notre limite de ${String(MAX_DESCRIPTION)} : ${String(horsNorme)} skills.`);
dire(`Scanner : ${String(refusees)} à refuser, ${String(aDemander)} à examiner à la main.`);
