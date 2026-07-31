/**
 * LA SAUVEGARDE — ce qu'on emporte, ce qu'on laisse, et pourquoi.
 *
 * Absorption d'Hermès (`hermes_cli/backup.py`), chantier n°33. T3 n'avait
 * aucun chemin de restauration : 1,8 Go d'état sur le disque du fondateur —
 * tous les fils, tout l'historique, l'index de rappel — et rien pour les
 * remettre en place si le disque part.
 *
 * Module PUR : il DÉCIDE, il ne copie rien.
 *
 * ── Mesuré avant d'écrire la moindre règle ─────────────────────────────────
 *
 *     ~/.t3                    1,8 Go
 *       userdata/state.sqlite  416 Mo   ← irremplaçable
 *       userdata/logs/         713 Mo   ← régénérable, le plus GROS du lot
 *       userdata/attachments/  353 Mo   ← irremplaçable
 *       userdata/secrets/       12 Ko   ← sensible
 *       le reste                < 1 Mo
 *
 * Sans exclusion des journaux, l'archive double de taille pour du contenu
 * qui se refabrique. C'est le symptôme qu'Hermès décrit : une sauvegarde qui
 * rampe des heures sur des centaines de milliers de fichiers régénérables.
 */

export type Traitement =
  /** Instantané SQLite cohérent — JAMAIS une copie de fichier. */
  | "instantane-sqlite"
  /** Copie telle quelle. */
  | "copie"
  /** Laissé dehors, et l'archive le DIT. */
  | "exclu";

export interface Decision {
  readonly traitement: Traitement;
  readonly pourquoi: string;
}

/**
 * Les fichiers annexes de SQLite.
 *
 * Les livrer À CÔTÉ d'un instantané frais apparie un instantané neuf avec un
 * état annexe périmé — et la restauration se déchire à la première ouverture.
 * Ils sont transitoires et refabriqués à la connexion suivante.
 */
const ANNEXES_SQLITE = [".sqlite-wal", ".sqlite-shm", ".sqlite-journal", ".db-wal", ".db-shm"];

/**
 * Ce qui se refabrique tout seul et ne mérite pas un octet d'archive.
 *
 * `voice-models` est arrivé dans cette liste en PLANIFIANT sur l'arbre réel :
 * `whisper-small-Q8_0.gguf` y pèse 257 Mo — un quart de l'archive — et se
 * retélécharge. Aucune liste écrite de tête ne l'aurait attrapé ; c'est la
 * mesure qui l'a trouvé.
 */
const DOSSIERS_REGENERABLES = [
  "logs",
  "node_modules",
  "caches",
  ".cache",
  "tmp",
  "worktrees",
  "voice-models",
  "models",
];

/** Ce qui n'a aucun sens sur une autre machine. */
const FICHIERS_TRANSITOIRES = [".pid", ".sock", ".lock"];

/**
 * LES SECRETS RESTENT DEHORS, et c'est un choix, pas un oubli.
 *
 * Une archive voyage : elle finit dans Téléchargements, sur une clé, dans un
 * dossier synchronisé. Y glisser des jetons d'authentification en fait une
 * fuite qui se promène. La LOI du projet est explicite (S2 : « secrets : env
 * uniquement, jamais commités »).
 *
 * Mais une archive qui les omet EN SILENCE est un piège symétrique : on
 * restaure, rien ne marche, et on cherche pendant une heure. L'exclusion doit
 * donc être ANNONCÉE dans le manifeste, avec le geste — reconnecter les
 * comptes après restauration.
 */
const DOSSIERS_SECRETS = ["secrets", "credentials"];

const finitPar = (chemin: string, suffixes: ReadonlyArray<string>) =>
  suffixes.some((suffixe) => chemin.endsWith(suffixe));

const traverse = (chemin: string, dossiers: ReadonlyArray<string>) =>
  chemin.split("/").some((segment) => dossiers.includes(segment));

/**
 * Ce qu'on fait d'un chemin, relatif à la racine d'état.
 *
 * L'ordre des tests EST la règle : les annexes SQLite sortent avant que la
 * base ne soit reconnue, sinon `state.sqlite-wal` serait pris pour une base
 * et on tenterait d'en faire un instantané.
 */
export function deciderPour(cheminRelatif: string): Decision {
  const chemin = cheminRelatif.replaceAll("\\", "/");

  if (finitPar(chemin, ANNEXES_SQLITE)) {
    return {
      traitement: "exclu",
      pourquoi:
        "annexe SQLite : la livrer avec un instantané frais produirait une restauration déchirée",
    };
  }
  if (traverse(chemin, DOSSIERS_SECRETS)) {
    return {
      traitement: "exclu",
      pourquoi: "secrets : une archive voyage — à reconnecter après restauration",
    };
  }
  if (traverse(chemin, DOSSIERS_REGENERABLES)) {
    return { traitement: "exclu", pourquoi: "se refabrique tout seul" };
  }
  if (finitPar(chemin, FICHIERS_TRANSITOIRES)) {
    return { traitement: "exclu", pourquoi: "sans objet sur une autre machine" };
  }
  if (finitPar(chemin, [".sqlite", ".db"])) {
    return {
      traitement: "instantane-sqlite",
      pourquoi:
        "instantané cohérent : copier le fichier principal seul omettrait le WAL déjà validé",
    };
  }
  return { traitement: "copie", pourquoi: "" };
}

export interface Entree {
  readonly chemin: string;
  readonly octets: number;
}

export interface PlanDeSauvegarde {
  readonly aPrendre: ReadonlyArray<Entree & { readonly traitement: Traitement }>;
  readonly laisses: ReadonlyArray<Entree & { readonly pourquoi: string }>;
  readonly octetsPris: number;
  readonly octetsLaisses: number;
  /** Ce que l'archive ne contient PAS, dit en clair. Jamais vide en pratique. */
  readonly avertissements: ReadonlyArray<string>;
}

/**
 * Le plan complet, avec ce qui est laissé dehors ET pourquoi.
 *
 * On ne rend jamais seulement la liste de ce qu'on prend : une sauvegarde
 * qui tait ses trous se lit comme complète, et c'est au moment de restaurer
 * qu'on découvre l'absence — trop tard, par définition.
 */
export function planifier(entrees: ReadonlyArray<Entree>): PlanDeSauvegarde {
  const aPrendre: Array<Entree & { traitement: Traitement }> = [];
  const laisses: Array<Entree & { pourquoi: string }> = [];

  for (const entree of entrees) {
    const decision = deciderPour(entree.chemin);
    if (decision.traitement === "exclu") {
      laisses.push({ ...entree, pourquoi: decision.pourquoi });
    } else {
      aPrendre.push({ ...entree, traitement: decision.traitement });
    }
  }

  const avertissements: string[] = [];
  const secretsLaisses = laisses.filter((entree) => entree.pourquoi.startsWith("secrets"));
  if (secretsLaisses.length > 0) {
    avertissements.push(
      `Les secrets ne sont PAS dans cette archive (${secretsLaisses.length} fichier(s)). Après restauration, reconnecte les comptes.`,
    );
  }
  const journaux = laisses.filter((entree) => entree.pourquoi === "se refabrique tout seul");
  if (journaux.length > 0) {
    avertissements.push(
      `${journaux.length} fichier(s) régénérables laissés dehors (${Math.round(journaux.reduce((somme, entree) => somme + entree.octets, 0) / 1_048_576)} Mo économisés).`,
    );
  }

  return {
    aPrendre,
    laisses,
    octetsPris: aPrendre.reduce((somme, entree) => somme + entree.octets, 0),
    octetsLaisses: laisses.reduce((somme, entree) => somme + entree.octets, 0),
    avertissements,
  };
}
