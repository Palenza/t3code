import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

/**
 * Ce qu'on fait d'un fichier venu du système — bouton « + », glisser-déposer
 * ou collage.
 *
 * L'ancienne règle était « images seulement », et son commentaire disait :
 * « offrir plus ici serait un mensonge, la charge utile des providers ne
 * prend que des images ». C'était vrai POUR LA VOIE INLINE, et faux pour tout
 * le reste : le composeur sait déjà envoyer un fichier par MENTION — un
 * simple lien markdown `[nom](chemin)` posé dans le texte du prompt
 * (`serializeComposerFileLink`). L'agent l'ouvre ensuite avec ses propres
 * outils, exactement comme Claude Code lit un PDF ou un CSV qu'on lui
 * @-mentionne. Aucune charge utile, aucune limite de taille, aucun format
 * interdit.
 *
 * D'où les deux voies, et la seule question qui les sépare : le provider
 * sait-il regarder CE fichier lui-même dans le tour ?
 *
 *   — une IMAGE : oui → voie inline (compression, plafond d'attachements) ;
 *   — tout le reste : non → voie MENTION, par le chemin.
 *
 * Le chemin absolu vient de `webUtils.getPathForFile` (pont desktop) : depuis
 * Electron 32, un `File` du renderer n'a plus de `.path`. Hors application
 * desktop, il n'y a pas de chemin du tout — et un fichier qu'on ne sait pas
 * situer se DIT, il ne se jette pas en silence.
 */

export interface TriDeFichiers {
  /** Les images, pour la voie inline existante. */
  readonly images: File[];
  /** Les mentions markdown prêtes à être insérées dans le prompt. */
  readonly mentions: string[];
  /**
   * Les fichiers non-image dont on n'a pas pu obtenir le chemin : ni inline
   * (le provider ne les lit pas), ni mention (on ne sait pas où ils sont).
   * L'appelant DOIT le dire à l'utilisateur.
   */
  readonly sansChemin: string[];
  /**
   * Les fichiers dont le chemin existe, mais PAS là où l'agent tourne : le
   * fil vise un environnement distant (WSL, SSH, machine de relais) et ce
   * chemin-là est celui du Mac. Une mention serait un lien mort.
   */
  readonly horsPortee: string[];
}

/** Un fichier que le provider sait regarder lui-même dans le tour. */
const estImage = (file: File) => file.type.startsWith("image/");

export function trierFichiers(
  files: ReadonlyArray<File>,
  cheminDe: (file: File) => string,
  /**
   * L'agent tourne-t-il sur CETTE machine ? Une mention est un CHEMIN, et un
   * chemin n'a de sens que là où il existe. Sur un environnement distant, le
   * `/Users/enzo/Desktop/...` du Mac ne désigne rien — et un lien mort qui
   * part quand même est exactement le genre de mine qu'on refuse : il ne
   * coûte rien à l'instant du dépôt, il explose au moment où l'agent lit.
   * Les images ne sont pas concernées : elles voyagent en octets dans le
   * tour, pas en chemin.
   */
  agentSurCetteMachine = true,
): TriDeFichiers {
  const images: File[] = [];
  const mentions: string[] = [];
  const sansChemin: string[] = [];
  const horsPortee: string[] = [];
  for (const file of files) {
    if (estImage(file)) {
      images.push(file);
      continue;
    }
    if (!agentSurCetteMachine) {
      horsPortee.push(file.name || "fichier sans nom");
      continue;
    }
    // `getPathForFile` rend "" pour tout ce qui ne vient pas du disque (un
    // blob fabriqué, un collage) — c'est son contrat, pas une erreur.
    let chemin = "";
    try {
      chemin = cheminDe(file);
    } catch {
      // Un pont absent ou en échec ne doit pas emporter le dépôt entier :
      // le fichier finit simplement dans « sans chemin », et se dit.
      chemin = "";
    }
    if (typeof chemin !== "string" || chemin.trim().length === 0) {
      sansChemin.push(file.name || "fichier sans nom");
      continue;
    }
    mentions.push(serializeComposerFileLink(chemin));
  }
  return { images, mentions, sansChemin, horsPortee };
}

/** Le message quand des fichiers n'ont pas pu être situés. */
export function messageSansChemin(noms: ReadonlyArray<string>): string {
  const liste = noms.map((nom) => `'${nom}'`).join(", ");
  return noms.length === 1
    ? `${liste} n'a pas pu être localisé sur le disque — glissez-le depuis le Finder, ou collez son chemin.`
    : `${liste} n'ont pas pu être localisés sur le disque — glissez-les depuis le Finder, ou collez leur chemin.`;
}

/** Le message quand l'agent ne tourne pas sur cette machine. */
export function messageHorsPortee(noms: ReadonlyArray<string>): string {
  const liste = noms.map((nom) => `'${nom}'`).join(", ");
  return `${liste} ${noms.length === 1 ? "vit" : "vivent"} sur ce Mac, mais ce fil tourne sur un environnement distant : l'agent ne verrait qu'un chemin mort. Copiez le fichier dans l'espace de travail distant, ou basculez le fil en local.`;
}

/**
 * Le chemin d'un fichier via le pont desktop, ou "" hors application desktop.
 * Isolé ici pour que le tri reste testable sans Electron.
 */
export function cheminDepuisLePontDesktop(file: File): string {
  if (typeof window === "undefined") return "";
  const pont = window.desktopBridge;
  if (pont === undefined || typeof pont.getPathForFile !== "function") return "";
  return pont.getPathForFile(file);
}
