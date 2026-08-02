/**
 * LA TRANSFORMATION DE SORTIE — une seule porte pour tout ce que nos outils
 * rendent au modèle.
 *
 * Absorption d'Hermès (`transform_tool_result`, `transform_terminal_output`),
 * chantier n°15. Chez eux c'est un point d'extension pour les plugins ; ici
 * c'est une PORTE OBLIGATOIRE, et c'est mieux : une transformation qu'on peut
 * oublier de brancher finit par être oubliée.
 *
 * ── Le trou qu'elle referme ───────────────────────────────────────────────
 *
 * Vérifié le 31/07 : aucun des quatre outils MCP de T3 ne caviardait sa
 * sortie. L'export, lui, le fait. Or `rappel` rend des messages d'un AUTRE
 * fil — donc une clé collée dans le fil A pouvait atterrir dans le contexte
 * du fil B, à un moment où plus personne ne la surveillait. L'export protège
 * ce qui sort vers un fichier ; il n'y avait rien pour ce qui sort vers un
 * modèle.
 *
 * ── Pourquoi une porte plutôt qu'une règle ────────────────────────────────
 *
 * Chaque poignée bornait déjà sa charge dans son coin — `rappel` à sa façon,
 * `repo_map` à la sienne. Recopier une règle dans chaque outil, c'est garantir
 * qu'un futur outil l'oubliera. La LOI le dit : mécanisable → mécanisé.
 *
 * Module PUR.
 */
import { caviarder } from "../secrets/Caviarder.ts";
import { avertissementDeMenace, scannerMenaces } from "../securite/MotifsDeMenace.ts";

/**
 * Le plafond d'une sortie d'outil, en caractères.
 *
 * ── Il a CHANGÉ de nature le 31/07, et il a donc baissé ───────────────────
 *
 * Tant qu'un dépassement TRONQUAIT, ce plafond était un fil-piège : il
 * fallait le poser au-delà du sain, parce que le toucher faisait perdre de la
 * donnée. Hermès, qui tronque, met le sien à 150 000 pour cette raison.
 *
 * Depuis que la sortie DÉBORDE sur disque (`DebordementSurDisque.ts`), le
 * toucher ne perd plus rien : ça remplace une queue par un pointeur. Le
 * plafond cesse d'être un garde-fou et devient un BUDGET — et un budget se
 * serre.
 *
 * ── Le reçu (31/07, `/tmp/plafond.mjs` sur 7 329 sorties réelles) ─────────
 *
 *   p50 = 342   p90 = 1 969   p99 = 158 789   max = 675 320
 *
 *   plafond    sorties touchées   volume économisé
 *   150 000        1,0 %              78 %      ← le leur
 *   120 000        1,1 %              80 %      ← le nôtre d'avant
 *    40 000        1,3 %              83 %      ← ici
 *    10 000        2,1 %              85 %
 *
 * 40 000 est le GENOU : en dessous, on embête 60 % de sorties en plus pour
 * deux points de volume. Au-dessus, on laisse passer du gras pour rien.
 *
 * Neuf dixièmes des sorties font moins de 2 000 caractères ; tout le volume
 * vit dans une queue de 1,3 %. C'est elle qu'on borne, et elle seule.
 */
export const PLAFOND_SORTIE = 40_000;

export interface Transformee<T> {
  readonly valeur: T;
  /** Ce que la porte a changé — vide quand elle n'a rien eu à faire. */
  readonly notes: ReadonlyArray<string>;
}

/**
 * Fait passer toute chaîne d'une structure par le caviardage, et borne le
 * poids total.
 *
 * On garde la FORME : le modèle reçoit le même objet, avec les mêmes clés. Ne
 * remplacer que le contenu évite de casser les schémas déclarés par les
 * outils — une porte qui change la forme est une porte qu'on débranche.
 */
export function transformerSortie<T>(valeur: T): Transformee<T> {
  const notes: string[] = [];
  let caviarde = 0;

  const parcourir = (noeud: unknown): unknown => {
    if (typeof noeud === "string") {
      const propre = caviarder(noeud);
      if (propre !== noeud) caviarde += 1;
      return propre;
    }
    if (Array.isArray(noeud)) return noeud.map(parcourir);
    if (typeof noeud === "object" && noeud !== null) {
      const sortie: Record<string, unknown> = {};
      for (const [cle, sousNoeud] of Object.entries(noeud)) {
        sortie[cle] = parcourir(sousNoeud);
      }
      return sortie;
    }
    return noeud;
  };

  const transforme = parcourir(valeur) as T;
  if (caviarde > 0) {
    notes.push(`${caviarde} champ(s) caviardé(s) avant de sortir vers le modèle.`);
  }

  // I2 — CONTENU TIERS = HOSTILE. `preview` rend des pages web, `repo_map` des
  // fichiers qu'on n'a pas écrits, `rappel` des messages d'un autre fil. Rien
  // de tout ça n'a été rédigé par nous, et tout entre dans le contexte du
  // modèle. La porte est le seul endroit où ça passe TOUT — le scan y a donc
  // sa place, et nulle part ailleurs.
  //
  // On CONSTATE, on ne bloque pas : un résultat d'outil n'est pas un chemin où
  // l'humain peut intervenir, et bloquer y ferait perdre des sorties
  // légitimes — un billet de sécurité parle d'injections, une issue GitHub
  // cite une CVE. L'avertissement, lui, rappelle au modèle que ce contenu est
  // de la DONNÉE.
  const menaces = scannerMenaces(serialiser(transforme), "contexte");
  const alerte = avertissementDeMenace(menaces);
  if (alerte !== null) notes.push(alerte);

  // Le poids se mesure sur la sérialisation, parce que c'est ELLE qui part
  // dans le contexte — pas la structure en mémoire.
  const poids = JSON.stringify(transforme)?.length ?? 0;
  if (poids > PLAFOND_SORTIE) {
    // On ne tronque PAS ici : couper au milieu d'un JSON rendrait une
    // structure invalide, et l'outil sait mieux que nous quoi sacrifier. On
    // le DIT, bruyamment, pour que le dépassement se répare à la source.
    notes.push(
      `⚠️ Sortie de ${poids} caractères, au-dessus du plafond ${PLAFOND_SORTIE}. L'outil doit borner sa charge en amont.`,
    );
  }

  return { valeur: transforme, notes };
}

/**
 * Une empreinte courte et STABLE d'un texte (djb2, en hexadécimal).
 *
 * Déterministe à dessein : deux sorties identiques donnent le même fichier de
 * débordement, donc le même se réécrit au lieu de s'accumuler. Une collision
 * n'a aucune conséquence — au pire deux sorties différentes partagent un nom,
 * et la seconde écrase la première, qui n'intéressait plus personne.
 *
 * Pas de `Date.now()` : un nom d'horodatage rendrait chaque appel unique et
 * ferait grossir le dossier sans fin.
 */
export function empreinteCourte(texte: string): string {
  let h = 5381;
  for (let i = 0; i < texte.length; i += 1) {
    h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * La sérialisation qui partira VRAIMENT dans le contexte.
 *
 * Vit ici et pas dans le débordement : ce module n'importe pas Effect, donc
 * `JSON` y est permis. Dans du code Effect, le diagnostic exige un `Schema` —
 * or on mesure une longueur, on ne décode rien.
 */
export function serialiser(valeur: unknown): string {
  return JSON.stringify(valeur) ?? "";
}

/** Ce qu'un allègement a coûté, pour que la note puisse le dire. */
export interface Allegement<T> {
  readonly valeur: T;
  /** `true` si au moins une chaîne a été raccourcie. */
  readonly allege: boolean;
  /** Caractères retirés du contexte. */
  readonly retires: number;
}

/**
 * Raccourcit les plus GROSSES chaînes d'une structure jusqu'à repasser sous le
 * plafond, en laissant dans chacune un pointeur vers l'intégral.
 *
 * ── Pourquoi les plus grosses, et pas une troncature globale ──────────────
 *
 * Couper la sérialisation d'un coup rendrait un JSON invalide. Couper toutes
 * les chaînes également sacrifierait les petites (des noms, des chemins, des
 * verdicts — le plus dense en information) pour épargner la grosse. On coupe
 * donc là où il y a du volume, et nulle part ailleurs : dans les faits, un
 * dépassement vient toujours d'un ou deux champs.
 *
 * La FORME est conservée : mêmes clés, mêmes types. Une porte qui change la
 * forme est une porte qu'on débranche.
 */
export function alleger<T>(valeur: T, plafond: number, chemin: string): Allegement<T> {
  const poidsInitial = JSON.stringify(valeur)?.length ?? 0;
  if (poidsInitial <= plafond) return { valeur, allege: false, retires: 0 };

  // On recense les chaînes par taille décroissante, puis on rogne la plus
  // grosse tant qu'on dépasse. Chaque passage garde un pointeur lisible.
  const cibles: Array<{
    readonly chemin: ReadonlyArray<string | number>;
    readonly taille: number;
  }> = [];
  const recenser = (noeud: unknown, ou: ReadonlyArray<string | number>): void => {
    if (typeof noeud === "string") {
      cibles.push({ chemin: ou, taille: noeud.length });
      return;
    }
    if (Array.isArray(noeud)) {
      noeud.forEach((sous, i) => recenser(sous, [...ou, i]));
      return;
    }
    if (typeof noeud === "object" && noeud !== null) {
      for (const [cle, sous] of Object.entries(noeud)) recenser(sous, [...ou, cle]);
    }
  };
  recenser(valeur, []);
  cibles.sort((a, b) => b.taille - a.taille);

  const copie = structuredClone(valeur) as T;
  const lire = (
    ou: ReadonlyArray<string | number>,
  ): { parent: any; cle: string | number } | null => {
    let courant: any = copie;
    for (let i = 0; i < ou.length - 1; i += 1) {
      courant = courant?.[ou[i] as never];
      if (courant === undefined || courant === null) return null;
    }
    const cle = ou.at(-1);
    return cle === undefined ? null : { parent: courant, cle };
  };

  let retires = 0;
  let allege = false;
  for (const cible of cibles) {
    if ((JSON.stringify(copie)?.length ?? 0) <= plafond) break;
    const place = lire(cible.chemin);
    if (place === null) continue;
    const texte = place.parent[place.cle];
    if (typeof texte !== "string") continue;

    const ou = cible.chemin.join(".");
    const pointeur = `\n\n… [tronqué — intégral dans ${chemin}, champ « ${ou.length > 0 ? ou : "(racine)"} »]`;
    // On garde une TÊTE utile : un début de sortie oriente, une chaîne vide
    // n'apprend rien. 2 000 caractères ≈ 500 jetons, le prix d'un pointeur
    // qui reste lisible.
    const garde = Math.min(texte.length, 2_000);
    if (texte.length <= garde + pointeur.length) continue;
    place.parent[place.cle] = texte.slice(0, garde) + pointeur;
    retires += texte.length - garde - pointeur.length;
    allege = true;
  }

  return { valeur: copie, allege, retires };
}

/**
 * Colle les notes de la porte dans un champ `note` existant.
 *
 * Les nôtres portent déjà un champ `note` où l'outil s'explique. Y ajouter ce
 * que la porte a fait garde tout au même endroit — un lecteur qui voit
 * « sk-ant***f3a9 » sans explication cherche pourquoi la clé ne marche pas.
 */
export function avecNotes<T extends { readonly note?: string }>(transformee: Transformee<T>): T {
  if (transformee.notes.length === 0) return transformee.valeur;
  const existante = transformee.valeur.note ?? "";
  const jointes = transformee.notes.join(" ");
  return {
    ...transformee.valeur,
    note: existante.length > 0 ? `${existante} ${jointes}` : jointes,
  };
}
