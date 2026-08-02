/**
 * SCAN DE SKILL — ce qui entre dans le savoir de l'agent doit être regardé.
 *
 * Chantier n°10, tête de la chaîne B. Aspiré de `tools/skills_guard.py`
 * d'Hermès (1 153 lignes, 121 motifs, 12 catégories).
 *
 * ── Pourquoi il PRÉCÈDE le hub, et pas l'inverse ──────────────────────────
 *
 * Le n°50 (hub) et le n°51 (les 182 skills) importent du code écrit par des
 * tiers, qui sera ensuite lu par l'agent à chaque session comme s'il venait de
 * nous. Importer avant de savoir valider, c'est importer du code hostile en
 * connaissance de cause (I2). L'ordre est forcé.
 *
 * ── Ce qu'on prend, et ce qu'on ne recopie pas ────────────────────────────
 *
 * Leurs 121 motifs se répartissent en 12 catégories. Cinq — injection,
 * exfiltration et leurs voisines — sont DÉJÀ couvertes par
 * `MotifsDeMenace.ts` (n°13), qu'on appelle en portée `strict` : c'est
 * exactement le cas d'usage pour lequel cette portée existe chez eux
 * (« écritures de mémoire et installations de skills seulement »).
 *
 * On ajoute ici ce que la bibliothèque partagée ne couvre pas, parce que ça
 * n'a de sens que dans un paquet de fichiers : obfuscation, persistance,
 * chaîne d'approvisionnement, escalade, destruction.
 *
 * ── Ce qu'une regex n'attrape jamais ──────────────────────────────────────
 *
 * La moitié de la valeur de leur scanner n'est pas dans les motifs :
 *
 * - un BINAIRE dans une skill (`.dylib`, `.exe`) n'a aucune raison d'exister ;
 * - 50 fichiers, 1 Mo, un fichier de 256 Ko : une skill est un document ;
 * - les CARACTÈRES INVISIBLES (largeur nulle, marques directionnelles) —
 *   du texte que l'humain qui relit ne voit pas et que le modèle lit.
 *
 * ── La matrice de politique ───────────────────────────────────────────────
 *
 * C'est leur vraie décision, et elle est bonne : le verdict seul ne suffit
 * pas, il faut le croiser avec la CONFIANCE dans la source.
 *
 * Module PUR.
 */

import { scannerMenaces } from "./MotifsDeMenace.ts";

export type Gravite = "critique" | "haute" | "moyenne";
export type Verdict = "sain" | "prudence" | "dangereux";
export type Confiance = "interne" | "de-confiance" | "communaute" | "faite-par-l-agent";
export type Decision = "installer" | "demander" | "refuser";

export interface Trouvaille {
  readonly id: string;
  readonly gravite: Gravite;
  readonly categorie: string;
  readonly quoi: string;
  /** Le fichier où ça a été vu. */
  readonly ou: string;
}

/** Une skill telle qu'on la reçoit : des fichiers, leur nom, leur contenu. */
export interface FichierDeSkill {
  readonly nom: string;
  readonly texte: string;
  readonly octets: number;
}

// ── Les bornes structurelles, aspirées telles quelles ──────────────────────
/** Une skill est un DOCUMENT. Au-delà, c'est autre chose. */
export const MAX_FICHIERS = 50;
export const MAX_TOTAL_KO = 1024;
export const MAX_FICHIER_KO = 256;

/** Ce qui n'a aucune raison d'être dans une skill. */
export const EXTENSIONS_BINAIRES: ReadonlySet<string> = new Set([
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".com",
  ".msi",
  ".dmg",
  ".app",
  ".deb",
  ".rpm",
]);

/**
 * Caractères invisibles — largeur nulle, marques directionnelles, jointeurs.
 *
 * Le vecteur le plus vicieux du lot : l'humain qui relit la skill ne voit
 * RIEN, et le modèle lit le texte caché. Aucune regex sur des mots ne
 * l'attrape.
 */
export const CARACTERES_INVISIBLES: ReadonlyArray<string> = [
  "​", // largeur nulle
  "‌",
  "‍",
  "⁠", // jointeur invisible
  "﻿", // marque d'ordre des octets
  "‪", // marques directionnelles
  "‫",
  "‬",
  "‭",
  "‮", // renversement droite-à-gauche : cache la vraie fin d'un nom
  "⁦",
  "⁧",
  "⁨",
  "⁩",
];

interface MotifDeSkill {
  readonly id: string;
  readonly gravite: Gravite;
  readonly categorie: string;
  readonly regex: RegExp;
  readonly quoi: string;
}

/**
 * Ce que la bibliothèque partagée (n°13) ne couvre pas : les classes qui
 * n'ont de sens que dans un paquet de fichiers installé.
 */
const MOTIFS_DE_SKILL: ReadonlyArray<MotifDeSkill> = [
  // ── Chaîne d'approvisionnement — le plus fréquent, et le plus banalisé ──
  s(
    "tuyau-vers-shell",
    "critique",
    "approvisionnement",
    String.raw`curl\s[^\n]{0,512}\|\s*(ba)?sh`,
    "télécharge et exécute directement (curl | sh)",
  ),
  s(
    "tuyau-vers-shell-wget",
    "critique",
    "approvisionnement",
    String.raw`wget\s[^\n]{0,512}\|\s*(ba)?sh`,
    "télécharge et exécute directement (wget | sh)",
  ),
  s(
    "tuyau-vers-python",
    "critique",
    "approvisionnement",
    String.raw`curl\s[^\n]{0,512}\|\s*python3?`,
    "télécharge et exécute du python",
  ),
  s(
    "pip-non-epingle",
    "moyenne",
    "approvisionnement",
    String.raw`pip3?\s+install\s+(?!-r\b)[a-z0-9_.\-]+\s*$`,
    "installe un paquet sans version épinglée",
  ),
  s(
    "npm-non-epingle",
    "moyenne",
    "approvisionnement",
    String.raw`npm\s+i(nstall)?\s+(?!--)[a-z0-9@/_.\-]+\s*$`,
    "installe un paquet sans version épinglée",
  ),

  // ── Obfuscation — si c'est caché, c'est qu'il y a une raison ────────────
  s(
    "base64-vers-shell",
    "critique",
    "obfuscation",
    String.raw`base64\s+(-d|--decode)[^\n]{0,256}\|\s*(ba)?sh`,
    "décode du base64 et l'exécute",
  ),
  s(
    "eval-de-chaine",
    "haute",
    "obfuscation",
    String.raw`\beval\s*\(\s*["'$\x60]`,
    // Resserré après la preuve en direct du 31/07 : `\beval\s*\(` mordait sur
    // de la PROSE française (« eval (…) » dans une skill de documentation).
    // Un garde qui crie sur du texte finit débranché — on exige donc la forme
    // du code : évaluer une chaîne ou une variable.
    "évalue une chaîne comme du code",
  ),
  s(
    "exec-de-chaine",
    "haute",
    "obfuscation",
    String.raw`\bexec\s*\(\s*["'$\x60]`,
    "exécute une chaîne comme du code",
  ),
  s(
    "echo-vers-shell",
    "critique",
    "obfuscation",
    String.raw`echo\s+[^\n]{0,256}\|\s*(ba)?sh`,
    "construit une commande puis l'exécute",
  ),
  s(
    "chaine-hexa",
    "moyenne",
    "obfuscation",
    String.raw`(\\x[0-9a-f]{2}){8,}`,
    "longue chaîne encodée en hexadécimal",
  ),
  s(
    "suite-echappements",
    "moyenne",
    "obfuscation",
    String.raw`(\\u[0-9a-f]{4}){8,}`,
    "longue chaîne d'échappements unicode",
  ),

  // ── Persistance — survivre au redémarrage, sans que personne l'ait voulu ──
  s(
    "cron",
    "critique",
    "persistance",
    String.raw`crontab\s+-|/etc/cron\.|@reboot\b`,
    "installe une tâche planifiée",
  ),
  s(
    "modif-rc-shell",
    "critique",
    "persistance",
    String.raw`>>\s*~?/?\.?(bashrc|zshrc|profile|bash_profile|zprofile)\b`,
    "ajoute du code au démarrage du shell",
  ),
  s(
    "porte-derobee-ssh",
    "critique",
    "persistance",
    String.raw`>>\s*[^\n]{0,256}authorized_keys`,
    "ajoute une clé SSH autorisée",
  ),
  s(
    "service-systeme",
    "critique",
    "persistance",
    String.raw`systemctl\s+enable|/etc/systemd/system/|launchctl\s+load|LaunchAgents/`,
    "installe un service au démarrage du système",
  ),
  s(
    "modif-git-global",
    "haute",
    "persistance",
    String.raw`git\s+config\s+--global`,
    "modifie la configuration git globale",
  ),

  // ── Escalade de privilèges ─────────────────────────────────────────────
  s(
    "sudo-sans-mot-de-passe",
    "critique",
    "escalade",
    String.raw`NOPASSWD|/etc/sudoers`,
    "touche à la configuration sudo",
  ),
  s(
    "bit-setuid",
    "critique",
    "escalade",
    String.raw`chmod\s+[ug]?\+s\b|chmod\s+[24]\d{3}\b`,
    "pose un bit setuid/setgid",
  ),

  // ── Destruction ────────────────────────────────────────────────────────
  s(
    "effacement-racine",
    "critique",
    "destruction",
    String.raw`rm\s+-[a-z]*[rf][a-z]*\s+(/|~|\$HOME)(\s|$)`,
    "efface récursivement la racine ou le home",
  ),
  s(
    "ecrasement-disque",
    "critique",
    "destruction",
    String.raw`\bdd\s+[^\n]{0,256}of=/dev/|mkfs\.`,
    "écrase un périphérique disque",
  ),
  s(
    "permissions-ouvertes",
    "haute",
    "destruction",
    String.raw`chmod\s+-R?\s*777\b`,
    "ouvre les permissions en grand",
  ),

  // ── Réseau ─────────────────────────────────────────────────────────────
  s(
    "shell-inverse",
    "critique",
    "reseau",
    String.raw`(bash|sh)\s+-i\s+>&\s*/dev/tcp/|nc\s+-[a-z]*e\b`,
    "ouvre un shell inverse",
  ),
  s(
    "socket-python",
    "critique",
    "reseau",
    String.raw`socket\.socket\([^\n]{0,128}\)[^\n]{0,256}connect\(`,
    "ouvre une connexion brute",
  ),
  s(
    "ecoute-toutes-interfaces",
    "moyenne",
    "reseau",
    String.raw`0\.0\.0\.0:\d+|--host[= ]0\.0\.0\.0`,
    "écoute sur toutes les interfaces",
  ),

  // ── Minage ─────────────────────────────────────────────────────────────
  s(
    "minage",
    "critique",
    "minage",
    String.raw`\b(xmrig|stratum\+tcp|cryptonight|minerd)\b`,
    "mineur de cryptomonnaie",
  ),

  // ── Remontée de chemin ─────────────────────────────────────────────────
  s(
    "remontee-profonde",
    "haute",
    "remontee",
    String.raw`(\.\./){4,}`,
    "remonte de quatre niveaux ou plus",
  ),
  s(
    "lecture-passwd",
    "haute",
    "remontee",
    String.raw`/etc/(passwd|shadow)\b`,
    "lit la base des comptes du système",
  ),
];

function s(
  id: string,
  gravite: Gravite,
  categorie: string,
  source: string,
  quoi: string,
): MotifDeSkill {
  return { id, gravite, categorie, regex: new RegExp(source, "imu"), quoi };
}

/**
 * La matrice de politique — leur vraie décision, et elle est bonne.
 *
 * Le verdict seul ne suffit pas : il se croise avec la CONFIANCE dans la
 * source. Une même trouvaille bloque une skill venue d'internet et passe sur
 * une skill qu'on a écrite.
 */
const POLITIQUE: Record<Confiance, Record<Verdict, Decision>> = {
  interne: { sain: "installer", prudence: "installer", dangereux: "installer" },
  "de-confiance": { sain: "installer", prudence: "installer", dangereux: "refuser" },
  communaute: { sain: "installer", prudence: "refuser", dangereux: "refuser" },
  // Faite par l'agent : on DEMANDE plutôt que de refuser. L'agent peut
  // recommencer sans le passage signalé — refuser sec lui ferait recommencer
  // à l'aveugle.
  "faite-par-l-agent": { sain: "installer", prudence: "installer", dangereux: "demander" },
};

export interface RapportDeScan {
  readonly verdict: Verdict;
  readonly decision: Decision;
  readonly trouvailles: ReadonlyArray<Trouvaille>;
  /** Nommé pour un AGENT (A7). */
  readonly resume: string;
}

/** Le verdict découle de la trouvaille la plus grave, jamais du nombre. */
function verdictDe(trouvailles: ReadonlyArray<Trouvaille>): Verdict {
  if (trouvailles.some((t) => t.gravite === "critique")) return "dangereux";
  if (trouvailles.some((t) => t.gravite === "haute")) return "prudence";
  return trouvailles.length > 0 ? "prudence" : "sain";
}

/** L'extension d'un nom de fichier, en minuscules, point compris. */
function extension(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point === -1 ? "" : nom.slice(point).toLowerCase();
}

/**
 * Scanne une skill entière : sa forme d'abord, son contenu ensuite.
 *
 * La forme d'abord parce qu'un binaire ou 200 fichiers se voient sans lire
 * une ligne — et parce qu'une regex sur un `.dylib` ne veut rien dire.
 */
export function scannerSkill(
  fichiers: ReadonlyArray<FichierDeSkill>,
  confiance: Confiance = "communaute",
): RapportDeScan {
  const trouvailles: Trouvaille[] = [];

  // ── 1 · La FORME. Ce qu'aucune regex n'attrape. ──
  if (fichiers.length > MAX_FICHIERS) {
    trouvailles.push({
      id: "trop-de-fichiers",
      gravite: "haute",
      categorie: "forme",
      quoi: `${fichiers.length} fichiers — une skill est un document, pas un projet (limite ${MAX_FICHIERS})`,
      ou: "(la skill)",
    });
  }
  const totalKo = Math.round(fichiers.reduce((n, f) => n + f.octets, 0) / 1024);
  if (totalKo > MAX_TOTAL_KO) {
    trouvailles.push({
      id: "trop-lourde",
      gravite: "haute",
      categorie: "forme",
      quoi: `${totalKo} Ko au total (limite ${MAX_TOTAL_KO})`,
      ou: "(la skill)",
    });
  }
  for (const fichier of fichiers) {
    if (EXTENSIONS_BINAIRES.has(extension(fichier.nom))) {
      trouvailles.push({
        id: "binaire-embarque",
        gravite: "critique",
        categorie: "forme",
        quoi: "un exécutable ou une bibliothèque n'a aucune raison d'être dans une skill",
        ou: fichier.nom,
      });
    }
    if (Math.round(fichier.octets / 1024) > MAX_FICHIER_KO) {
      trouvailles.push({
        id: "fichier-trop-gros",
        gravite: "moyenne",
        categorie: "forme",
        quoi: `${Math.round(fichier.octets / 1024)} Ko (limite ${MAX_FICHIER_KO})`,
        ou: fichier.nom,
      });
    }
    const invisible = CARACTERES_INVISIBLES.find((c) => fichier.texte.includes(c));
    if (invisible !== undefined) {
      trouvailles.push({
        id: "caractere-invisible",
        gravite: "critique",
        categorie: "obfuscation",
        quoi: `caractère invisible U+${invisible.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")} — l'humain qui relit ne le voit pas, le modèle le lit`,
        ou: fichier.nom,
      });
    }
  }

  // ── 2 · Le CONTENU. La bibliothèque partagée, puis ce qu'elle ne couvre pas. ──
  for (const fichier of fichiers) {
    if (EXTENSIONS_BINAIRES.has(extension(fichier.nom))) continue;
    for (const menace of scannerMenaces(fichier.texte, "strict")) {
      trouvailles.push({
        id: menace.id,
        gravite: "critique",
        categorie: "injection-ou-exfiltration",
        quoi: menace.quoi,
        ou: fichier.nom,
      });
    }
    for (const motif of MOTIFS_DE_SKILL) {
      if (motif.regex.test(fichier.texte)) {
        trouvailles.push({
          id: motif.id,
          gravite: motif.gravite,
          categorie: motif.categorie,
          quoi: motif.quoi,
          ou: fichier.nom,
        });
      }
    }
  }

  const verdict = verdictDe(trouvailles);
  const decision = POLITIQUE[confiance][verdict];
  const pires = trouvailles.filter((t) => t.gravite === "critique").slice(0, 5);
  const resume =
    trouvailles.length === 0
      ? `Rien de signalé. Source « ${confiance} » → ${decision}.`
      : `${trouvailles.length} signalement(s), verdict « ${verdict} », source « ${confiance} » → ${decision}.${
          pires.length > 0
            ? ` Le plus grave : ${pires.map((t) => `${t.id} dans ${t.ou}`).join(", ")}.`
            : ""
        }`;

  return { verdict, decision, trouvailles, resume };
}
