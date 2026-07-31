/**
 * LE RAPPEL — retrouver une conversation d'il y a trois semaines.
 *
 * Règle PURE : aucune base, aucun effet. Repris d'Hermès
 * (`tools/session_search_tool.py`), dont la trouvaille tient en une phrase :
 * une recherche de rappel n'a besoin d'AUCUN appel de modèle. FTS5 rend les
 * messages eux-mêmes, on ne paie que du disque.
 *
 * Trois modes, DÉDUITS des arguments — pas de paramètre `mode`. C'est leur
 * meilleure décision d'interface : moins de façons de se tromper pour l'agent
 * qui appelle. Une seule forme d'outil, trois comportements :
 *
 *   · DÉCOUVERTE — on donne `question`. FTS5, un résultat par fil, fenêtre
 *     autour de la trouvaille, plus les bornes du fil (début et fin) pour
 *     s'orienter. Coût modèle : zéro.
 *   · DÉFILEMENT — on donne `filId` + `autourDe`. Une fenêtre centrée, pas de
 *     recherche. Pour remonter ou descendre, on se réancre sur le premier ou
 *     le dernier message rendu.
 *   · PARCOURS — on ne donne rien. Les fils récents, du plus frais au plus
 *     ancien.
 */

/** Ce que l'appelant demande. Les trois modes se lisent dans ces champs. */
export interface DemandeDeRappel {
  readonly question?: string | undefined;
  readonly filId?: string | undefined;
  readonly autourDe?: string | undefined;
}

export type ModeDeRappel = "decouverte" | "defilement" | "parcours";

/**
 * Le mode se DÉDUIT, il ne se déclare pas.
 *
 * L'ordre compte : `filId` + `autourDe` gagne sur `question`. Donner les trois
 * veut dire « je défile dans ce fil », pas « cherche partout » — sinon un
 * appelant qui garde sa question en mémoire pendant qu'il défile relancerait
 * une recherche à chaque pas.
 */
export function modeDeRappel(demande: DemandeDeRappel): ModeDeRappel {
  const filId = demande.filId?.trim() ?? "";
  const autourDe = demande.autourDe?.trim() ?? "";
  if (filId.length > 0 && autourDe.length > 0) return "defilement";
  if ((demande.question?.trim() ?? "").length > 0) return "decouverte";
  return "parcours";
}

/**
 * Les caractères qui font PARLER FTS5 au lieu de le faire chercher.
 *
 * `MATCH` a une grammaire : guillemets, `*`, `:`, `(`, `)`, `-`, `^`, et les
 * mots-clés `AND` / `OR` / `NOT` / `NEAR`. Une question d'humain en contient
 * naturellement — « c'est quoi ce délire ? », un chemin `src/api`, un
 * `--flag`. Injectée telle quelle, la requête ne rend pas zéro résultat :
 * elle LÈVE, et la recherche a l'air cassée alors qu'elle a juste été mal
 * citée.
 *
 * On ne tente donc pas d'interpréter l'intention de l'utilisateur. On découpe
 * en mots, on cite chaque mot, et FTS5 les combine en ET implicite.
 */
const SEPARATEURS = /[^\p{L}\p{N}_]+/u;

/**
 * Traduit une question d'humain en expression `MATCH` sûre, ou `null` quand
 * il ne reste rien de cherchable (« ??? », « --- »).
 */
export function expressionMatch(question: string): string | null {
  const mots = question
    .split(SEPARATEURS)
    .map((mot) => mot.trim())
    .filter((mot) => mot.length > 0);
  if (mots.length === 0) return null;
  // Chaque mot devient une phrase citée : plus aucun opérateur ne survit, et
  // les guillemets internes sont impossibles puisque le découpage les a
  // mangés. On les double malgré tout — une citation qui dépend d'un
  // découpage en amont est une mine posée pour le prochain qui le changera.
  return mots.map((mot) => `"${mot.replaceAll('"', '""')}"`).join(" ");
}

/** Un message rendu par l'index. */
export interface TrouvailleBrute {
  readonly messageId: string;
  readonly filId: string;
  readonly score: number;
  readonly filArchive: boolean;
}

/**
 * UN RÉSULTAT PAR FIL, et les fils archivés passent derrière.
 *
 * Sans regroupement, un fil qui répète un terme trente fois occupe toute la
 * page et masque les vingt autres conversations où il apparaît une fois.
 * C'est le défaut qu'Hermès a mesuré puis corrigé (#19434, « recall
 * blindness ») : ils avaient des sessions cron répétitives qui dominaient
 * BM25 et affamaient les vraies. Ils les ont RÉTROGRADÉES, pas exclues —
 * elles restent atteignables quand elles sont la seule réponse.
 *
 * Ici l'équivalent est le fil archivé : on l'a rangé, on ne l'a pas jeté.
 *
 * `bm25()` de SQLite rend un score NÉGATIF, plus petit = meilleur. La pénalité
 * est donc une ADDITION.
 */
export const PENALITE_FIL_ARCHIVE = 2;

export function meilleurParFil(
  trouvailles: ReadonlyArray<TrouvailleBrute>,
  plafond: number,
): TrouvailleBrute[] {
  const meilleur = new Map<string, TrouvailleBrute>();
  for (const trouvaille of trouvailles) {
    const ancienne = meilleur.get(trouvaille.filId);
    if (ancienne === undefined || score(trouvaille) < score(ancienne)) {
      meilleur.set(trouvaille.filId, trouvaille);
    }
  }
  return [...meilleur.values()].sort((a, b) => score(a) - score(b)).slice(0, Math.max(0, plafond));
}

function score(trouvaille: TrouvailleBrute): number {
  return trouvaille.score + (trouvaille.filArchive ? PENALITE_FIL_ARCHIVE : 0);
}

/** Un message tel qu'on le rend à l'appelant. */
export interface MessageDeFil {
  readonly messageId: string;
  readonly role: string;
  readonly texte: string;
  readonly creeA: string;
}

/**
 * La fenêtre autour d'un message — ±`rayon`, bornée aux extrémités du fil.
 *
 * Une trouvaille seule ne se comprend pas : « oui, il faut le faire » ne dit
 * rien sans la question qui précède.
 */
export function fenetreAutour(
  messages: ReadonlyArray<MessageDeFil>,
  ancre: string,
  rayon: number,
): MessageDeFil[] {
  const index = messages.findIndex((message) => message.messageId === ancre);
  if (index < 0) return [];
  const debut = Math.max(0, index - rayon);
  return messages.slice(debut, Math.min(messages.length, index + rayon + 1));
}

/**
 * LES BORNES DU FIL — les `combien` premiers et les `combien` derniers.
 *
 * C'est ce qui sépare un extrait d'une ORIENTATION. Le début dit de quoi
 * partait la conversation, la fin dit où elle a abouti. Sans ça, l'agent
 * retrouve une phrase sans savoir dans quelle histoire elle vivait.
 *
 * Quand le fil est plus court que `2 × combien`, on le rend ENTIER plutôt que
 * de fabriquer deux tranches qui se chevauchent et affichent deux fois les
 * mêmes messages.
 */
export interface BornesDeFil {
  readonly debut: MessageDeFil[];
  readonly fin: MessageDeFil[];
}

export function bornesDeFil(messages: ReadonlyArray<MessageDeFil>, combien: number): BornesDeFil {
  const n = Math.max(0, combien);
  if (n === 0) return { debut: [], fin: [] };
  if (messages.length <= n * 2) return { debut: [...messages], fin: [] };
  return { debut: messages.slice(0, n), fin: messages.slice(messages.length - n) };
}

/** Les valeurs par défaut, alignées sur Hermès : ±5 autour, 3 de chaque bout. */
export const RAYON_FENETRE = 5;
export const TAILLE_BORNES = 3;
export const FILS_PAR_DECOUVERTE = 8;

/**
 * LES BORNES DE LA CHARGE — mesurées, jamais devinées.
 *
 * Livré sans elles le 31/07, le rappel pouvait rendre **258 000 jetons en un
 * appel** : un quart de la fenêtre de contexte, avalé par un outil censé en
 * FAIRE GAGNER. Un seul message de la base pèse 104 000 jetons.
 *
 * ── Ce qui a été mesuré, sur 3 851 messages réels ──────────────────────────
 *
 *     p50      180 caractères        p99    4 568
 *     p90    1 210                   p99.9 28 240
 *     p95    2 184                   max  416 190
 *
 * ── Trois tiers, parce que les messages n'ont pas le même rôle ─────────────
 *
 * Couper tout à la même longueur, c'est traiter la PREUVE comme du décor.
 * Le message trouvé doit arriver entier — c'est lui qu'on est venu chercher.
 * Ses voisins servent à le comprendre. Les bornes servent à situer le fil.
 *
 *   · ANCRE   8 000 — au-dessus du p99 (4 568) : seul l'énorme la touche.
 *   · VOISIN  1 200 — posé sur le p90 (1 210) : neuf voisins sur dix passent
 *                     entiers, et les monstres sont ramenés à leur utilité.
 *   · BORNE     800 — on s'oriente, on ne relit pas.
 *
 * Effet mesuré : le pire cas réaliste passe de 35 858 à 18 490 jetons, et
 * une question ordinaire coûte 1 000 à 15 000.
 *
 * ── Le fil-piège global ────────────────────────────────────────────────────
 *
 * 120 000 caractères ≈ 30 000 jetons, soit 1,6× le pire cas RÉEL mesuré
 * (73 960). Aucune question saine ne peut l'approcher ; seule une requête qui
 * touche huit fils énormes à la fois la rencontre. Si un cas sain la touche
 * un jour, c'est la limite qui a tort : on remesure et on met à jour ce reçu.
 *
 * Et rien n'est coupé en silence (A7) : chaque troncature nomme la limite et
 * ce qui manque, chaque fil écarté est compté dans la note.
 */
export const PLAFOND_ANCRE = 8_000;
export const PLAFOND_VOISIN = 1_200;
export const PLAFOND_BORNE = 800;
export const PLAFOND_CHARGE = 120_000;

/** Coupe un message trop long en le DISANT dans le texte rendu. */
export function tronquerMessage(message: MessageDeFil, plafond: number): MessageDeFil {
  if (message.texte.length <= plafond) return message;
  const retire = message.texte.length - plafond;
  return {
    ...message,
    texte: `${message.texte.slice(0, plafond)}\n\n[…coupé : ${retire} caractères de plus, plafond ${plafond} par message. Ouvre le fil pour la suite.]`,
  };
}

export interface ChargeBornee<T> {
  readonly retenus: T[];
  /** Combien d'éléments n'ont PAS été rendus — jamais tu, toujours dit. */
  readonly ecartes: number;
}

/**
 * Garde des éléments tant que le budget tient, et compte ceux qu'on laisse.
 *
 * On garde TOUJOURS le premier, même s'il dépasse à lui seul : rendre zéro
 * résultat parce que le meilleur est trop gros serait la pire réponse
 * possible — l'agent conclurait « rien trouvé » alors qu'on a trouvé.
 */
export function bornerCharge<T>(
  elements: ReadonlyArray<T>,
  taille: (element: T) => number,
  budget: number,
): ChargeBornee<T> {
  const retenus: T[] = [];
  let cumul = 0;
  for (const element of elements) {
    const poids = taille(element);
    if (retenus.length > 0 && cumul + poids > budget) break;
    retenus.push(element);
    cumul += poids;
  }
  return { retenus, ecartes: elements.length - retenus.length };
}
