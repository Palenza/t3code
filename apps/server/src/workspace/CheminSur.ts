/**
 * CHEMIN SÛR — un lien symbolique ne doit pas faire sortir une écriture.
 *
 * Chantier n°21 (`tools/path_security.py`), et surtout : correction d'une
 * ASYMÉTRIE trouvée dans `WorkspaceFileSystem`.
 *
 * ── Le trou, démontré ─────────────────────────────────────────────────────
 *
 * `readFile` fait un `realpath` sur la racine ET sur la cible : un lien
 * symbolique qui pointe dehors est donc refusé. `writeFile`, lui, ne passe
 * que par un contrôle LEXICAL — il rejette `..` et l'absolu, mais ne suit
 * aucun lien.
 *
 * Vérifié en direct le 31/07 sur un dépôt d'essai : une écriture sur
 * `sous/lien/vole.txt`, où `sous/lien` pointe hors du dépôt, est ACCEPTÉE par
 * le contrôle lexical, et le fichier atterrit dehors. La même lecture est
 * refusée.
 *
 * Ce n'est pas théorique ici : un dépôt pnpm est plein de liens
 * (`node_modules/@t3tools/shared` → `packages/shared`, et le magasin
 * `.pnpm` qui sort carrément de l'arbre).
 *
 * ── La subtilité qui rend la correction non triviale ──────────────────────
 *
 * On ne peut pas faire `realpath` sur la cible d'une écriture : le fichier
 * n'existe pas encore, et l'appel échoue. C'est probablement pour ça que le
 * contrôle est resté lexical de ce côté.
 *
 * La bonne réponse : remonter jusqu'au PREMIER ANCÊTRE QUI EXISTE, résoudre
 * celui-là, et vérifier qu'il est dans la racine. Ce qui reste après lui
 * n'existe pas encore, donc ne peut être un lien vers nulle part.
 *
 * Module PUR : on lui donne des chemins déjà résolus, il décide.
 */

export interface VerdictDeChemin {
  readonly sur: boolean;
  /** Nommé pour un AGENT (A7) : ce qui a été demandé, où ça mène, la racine. */
  readonly pourquoi: string;
}

/**
 * Un chemin est-il confiné à sa racine, une fois les liens résolus ?
 *
 * `relatif` est le résultat de `path.relative(racineReelle, cibleReelle)`.
 * On teste ce que ce résultat DIT, pas ce que le chemin d'origine laissait
 * croire.
 */
export function estConfine(relatif: string, separateur = "/"): boolean {
  if (relatif.length === 0) return true;
  if (relatif === "..") return false;
  if (relatif.startsWith(`..${separateur}`)) return false;
  // Un chemin absolu ici veut dire que `path.relative` n'a trouvé AUCUN
  // ancêtre commun — deux volumes, deux racines. C'est le cas le plus franc
  // de sortie, et le plus facile à oublier.
  if (relatif.startsWith("/") || /^[A-Za-z]:/u.test(relatif)) return false;
  return true;
}

/**
 * Le verdict complet, avec le message.
 *
 * On nomme les TROIS chemins : celui qui a été demandé, celui où il mène
 * vraiment, et la racine. Un agent répare « ça mène à /tmp/dehors » ; il ne
 * peut rien faire de « chemin invalide ».
 */
export function verdictDeChemin(input: {
  readonly demande: string;
  readonly racineReelle: string;
  readonly cibleReelle: string;
  readonly relatif: string;
  readonly separateur?: string;
}): VerdictDeChemin {
  if (estConfine(input.relatif, input.separateur ?? "/")) {
    return { sur: true, pourquoi: "" };
  }
  return {
    sur: false,
    pourquoi: `« ${input.demande} » sort de l'espace de travail : une fois les liens résolus, il mène à « ${input.cibleReelle} », hors de « ${input.racineReelle} ».`,
  };
}

/**
 * Découpe un chemin relatif en segments, pour remonter aux ancêtres.
 *
 * On garde l'ordre du plus PROFOND au plus proche de la racine : c'est
 * l'ordre dans lequel on cherche le premier ancêtre existant, et le premier
 * trouvé est le plus précis.
 */
export function ancetresDuPlusProfond(relatif: string, separateur = "/"): string[] {
  const segments = relatif
    .split(/[/\\]/u)
    .filter((segment) => segment.length > 0 && segment !== ".");
  const ancetres: string[] = [];
  // On part de l'avant-dernier : le dernier segment est le fichier lui-même,
  // qui n'existe pas encore par définition.
  for (let combien = segments.length - 1; combien > 0; combien -= 1) {
    ancetres.push(segments.slice(0, combien).join(separateur));
  }
  // La racine elle-même clôt toujours la liste : elle existe forcément, donc
  // la recherche se termine, toujours.
  ancetres.push("");
  return ancetres;
}
