/**
 * L'INVENTAIRE — ce qu'on colle dans un rapport quand quelque chose cloche.
 *
 * Chantier n°59, chaîne F. Aspiré de `hermes_cli/inventory.py`, `dump.py`,
 * `status.py` et `diagnostics_upload.py`.
 *
 * ── Ce que le `doctor` (n°46) ne fait pas ─────────────────────────────────
 *
 * Le doctor DIAGNOSTIQUE : il regarde les quotas, la dérive de l'index, le
 * carnet des pannes, et il dit ce qui ne va pas. L'inventaire DÉCRIT : quelles
 * versions, quels comptes, quels serveurs MCP, où vit l'état et combien il
 * pèse. Deux métiers, et les confondre donnerait un outil qui répond mal aux
 * deux questions.
 *
 * ── La contrainte qu'ils n'ont pas nommée, et qui décide de la forme ──────
 *
 * Un inventaire est fait pour ÊTRE PARTAGÉ. Chez eux il part même sur un
 * serveur (`diagnostics_upload.py`). Le nôtre sera collé dans un message, une
 * issue, un rapport de bug — c'est-à-dire dans un endroit d'où on ne peut plus
 * le retirer.
 *
 * Donc : **aucune valeur, jamais**. On dit qu'une variable d'environnement
 * EXISTE, pas ce qu'elle vaut. On dit qu'un compte est connecté, pas quel
 * jeton il porte. Un chemin sous le home est raccourci en `~`, parce que le
 * nom de session est déjà une donnée personnelle — c'est la même leçon que
 * l'auteur d'une skill qu'on ne prend jamais à la machine (n°4).
 *
 * Module PUR : on lui donne des faits, il rend un texte.
 */

export interface FaitsDInventaire {
  readonly versionApp: string;
  readonly plateforme: string;
  readonly versionNode: string;
  /** Le home de l'utilisateur, pour le raccourcir en `~`. */
  readonly home: string;
  readonly comptes: ReadonlyArray<{
    readonly nom: string;
    readonly driver: string;
    readonly actif: boolean;
    /** Le chemin de son dossier de configuration — raccourci avant sortie. */
    readonly chemin?: string;
  }>;
  readonly serveursMcp: ReadonlyArray<{ readonly nom: string; readonly joignable: boolean }>;
  readonly skills: number;
  /** Taille de l'état sur disque, en octets. */
  readonly etatOctets: number;
  /** Noms des variables d'environnement pertinentes — JAMAIS leurs valeurs. */
  readonly variables: ReadonlyArray<string>;
}

/**
 * Raccourcit un chemin sous le home.
 *
 * `/Users/prenom.nom/.t3/...` devient `~/.t3/...`. Le nom de session est une
 * donnée personnelle, et il apparaît dans chaque chemin.
 */
export function sansLeHome(chemin: string, home: string): string {
  if (home.length === 0) return chemin;
  return chemin.startsWith(home) ? `~${chemin.slice(home.length)}` : chemin;
}

/** `1536` → `1,5 Ko`. Un inventaire se lit, il ne se calcule pas. */
export function enTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  const unites = ["Ko", "Mo", "Go"];
  let valeur = octets / 1024;
  let i = 0;
  while (valeur >= 1024 && i < unites.length - 1) {
    valeur /= 1024;
    i += 1;
  }
  return `${valeur.toFixed(1).replace(".", ",")} ${unites[i]}`;
}

/**
 * L'inventaire, en texte prêt à coller.
 *
 * Aucune valeur de secret n'y entre par construction : les variables sont
 * listées par NOM, les comptes par état. Il n'y a rien à caviarder parce
 * qu'il n'y a rien à cacher — c'est plus sûr qu'un caviardage qui pourrait
 * rater un cas.
 */
export function rendreInventaire(faits: FaitsDInventaire): string {
  const lignes: string[] = [];
  const dire = (cle: string, valeur: string) => lignes.push(`${cle.padEnd(16)} ${valeur}`);

  dire("T3 Code", faits.versionApp);
  dire("plateforme", `${faits.plateforme} · node ${faits.versionNode}`);
  dire("état", `${enTaille(faits.etatOctets)} sur disque`);
  dire("skills", String(faits.skills));

  lignes.push("");
  lignes.push(`comptes (${faits.comptes.length})`);
  if (faits.comptes.length === 0) {
    lignes.push("  aucun — c'est probablement la cause de ce que tu observes");
  }
  for (const compte of faits.comptes) {
    const ou = compte.chemin === undefined ? "" : ` · ${sansLeHome(compte.chemin, faits.home)}`;
    lignes.push(`  ${compte.actif ? "●" : "○"} ${compte.nom} (${compte.driver})${ou}`);
  }

  lignes.push("");
  lignes.push(`serveurs MCP (${faits.serveursMcp.length})`);
  if (faits.serveursMcp.length === 0) lignes.push("  aucun");
  for (const serveur of faits.serveursMcp) {
    lignes.push(`  ${serveur.joignable ? "✅" : "⛔"} ${serveur.nom}`);
  }

  if (faits.variables.length > 0) {
    lignes.push("");
    // Les NOMS seulement. Un inventaire se colle dans un endroit d'où on ne
    // peut plus le retirer.
    lignes.push(`variables d'environnement présentes (noms seuls, aucune valeur)`);
    lignes.push(`  ${[...faits.variables].sort().join(", ")}`);
  }

  return lignes.join("\n");
}

/**
 * Ce qui, dans l'inventaire, mérite qu'on regarde tout de suite.
 *
 * Un inventaire de quarante lignes qu'on colle dans un rapport n'est lu par
 * personne en entier. Cette phrase-là, si.
 */
export function saillantDeLInventaire(faits: FaitsDInventaire): string | null {
  const morts = faits.serveursMcp.filter((s) => !s.joignable).map((s) => s.nom);
  const alarmes: string[] = [];
  if (faits.comptes.length === 0) alarmes.push("aucun compte configuré");
  else if (!faits.comptes.some((c) => c.actif)) alarmes.push("aucun compte actif");
  if (morts.length > 0)
    alarmes.push(`${morts.length} serveur(s) MCP injoignable(s) : ${morts.join(", ")}`);
  return alarmes.length === 0 ? null : alarmes.join(" · ");
}
