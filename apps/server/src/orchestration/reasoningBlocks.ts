import {
  REASONING_ACTIVITY_KIND,
  type OrchestrationThreadActivity,
  type TurnId,
} from "@t3tools/contracts";

/**
 * LA RÉFLEXION DU MODÈLE, EN BLOCS QUI COULENT.
 *
 * Les trois fournisseurs (Claude, Codex, OpenCode) émettent déjà la réflexion
 * sous forme de deltas `content.delta` de `streamKind: "reasoning_text"`.
 * L'ingestion ne gardait que `assistant_text` et jetait le reste en silence.
 * Ce module tient l'état du bloc en cours ; l'ingestion l'emmène du flux à
 * l'activité de fil.
 *
 * ── Pourquoi une activité, et pas un champ de message ────────────────────
 *
 * `OrchestrationMessage.text` est une chaîne plate, sans notion de « part » :
 * y loger la réflexion demanderait une migration SQL, dupliquerait la règle
 * d'append (read model mémoire ET projection SQL) et ferait tourner le trigger
 * FTS à chaque jeton. Le `kind` d'une activité, lui, est une chaîne ouverte et
 * son `payload` est libre — rien à élargir, rien à migrer.
 *
 * ── Comment ça coule ─────────────────────────────────────────────────────
 *
 * Ré-émettre une activité avec le MÊME id la remplace (projector.ts : le
 * tableau est filtré sur l'id avant l'ajout). On ré-appende donc le même id
 * avec le texte accumulé, et le texte grandit à l'écran.
 */

/**
 * Tous les combien on ré-émet, en CARACTÈRES accumulés.
 *
 * Chaque ré-émission porte le texte ENTIER du bloc : émettre à chaque jeton
 * coûterait le carré de la longueur en octets sur le fil. À 96 caractères, un
 * bloc de 4 000 caractères tient en ~42 émissions au lieu de ~1 000, et l'œil
 * lit un flux continu — c'est la granularité d'une demi-ligne.
 *
 * Un seuil en CARACTÈRES, pas en millisecondes : il se teste sans horloge
 * simulée, et il ne dépend pas de la vitesse du réseau du jour.
 */
export const REASONING_FLUSH_CHARS = 96;

/**
 * Plafond par bloc. Aligné sur MAX_BUFFERED_ASSISTANT_CHARS, qui borne déjà le
 * texte d'assistant tamponné dans le même fichier — deux plafonds différents
 * pour deux textes du même tour seraient une incohérence à expliquer.
 */
export const MAX_REASONING_CHARS = 24_000;

/** Le libellé de la ligne. Anglais, comme « Plan updated » et « Runtime error ». */
export const REASONING_SUMMARY = "Thinking";

export { REASONING_ACTIVITY_KIND };

export interface ReasoningBlock {
  /**
   * L'id de l'activité, dérivé de l'événement qui a OUVERT le bloc.
   *
   * Deux raisons, et la seconde a mordu le 02/08 :
   *
   * 1. Il est stable tant que le bloc vit — et c'est tout le mécanisme du
   *    streaming, puisque ré-appender le même id remplace au lieu d'empiler.
   * 2. Il se TRIE au bon endroit. Personne n'écrit `sessionSequence` dans ce
   *    dépôt (le champ n'est que lu), donc `sequence` est absent partout et
   *    l'ordre retombe sur `createdAt` puis, à égalité de milliseconde, sur
   *    l'id. Un id inventé (« reasoning:… ») se rangeait alors par ordre
   *    alphabétique parmi les ids d'événements — une pensée pouvait sauter
   *    par-dessus l'outil qu'elle suivait. En héritant de l'id du premier
   *    delta, la ligne se range exactement là où la pensée a commencé.
   */
  readonly activityId: string;
  readonly text: string;
  /** Longueur déjà émise — sert à décider s'il est temps de ré-émettre. */
  readonly emittedLength: number;
  /**
   * Figés au PREMIER delta du bloc, et jamais retouchés.
   *
   * L'ordre d'affichage se joue sur `sequence` puis `createdAt`. Les bouger à
   * chaque ré-émission ferait sauter la ligne au bas du fil à chaque flux —
   * une réflexion qui double un outil déjà affiché.
   */
  readonly createdAt: string;
  readonly sequence: number | undefined;
  /** Vrai dès qu'on a refusé du texte : la limite doit se VOIR. */
  readonly truncated: boolean;
  /** Combien de caractères la limite a coûtés. Un dépassement se chiffre. */
  readonly droppedChars: number;
}

export function openReasoningBlock(input: {
  /** L'id de l'événement porteur du premier delta du bloc. */
  readonly openingEventId: string;
  readonly createdAt: string;
  readonly sequence: number | undefined;
}): ReasoningBlock {
  return {
    activityId: reasoningActivityId(input.openingEventId),
    text: "",
    emittedLength: 0,
    createdAt: input.createdAt,
    sequence: input.sequence,
    truncated: false,
    droppedChars: 0,
  };
}

/**
 * Ajoute un delta, en s'arrêtant net au plafond.
 *
 * On garde le DÉBUT et on jette la fin : une réflexion se lit du début, et
 * c'est là que le modèle pose son raisonnement. Le compte des caractères
 * refusés est conservé pour que la ligne puisse le dire.
 */
export function appendReasoningDelta(block: ReasoningBlock, delta: string): ReasoningBlock {
  if (delta.length === 0) {
    return block;
  }
  const roomLeft = MAX_REASONING_CHARS - block.text.length;
  if (roomLeft <= 0) {
    return { ...block, truncated: true, droppedChars: block.droppedChars + delta.length };
  }
  if (delta.length <= roomLeft) {
    return { ...block, text: block.text + delta };
  }
  return {
    ...block,
    text: block.text + delta.slice(0, roomLeft),
    truncated: true,
    droppedChars: block.droppedChars + (delta.length - roomLeft),
  };
}

/**
 * Est-il temps de ré-émettre ?
 *
 * Le tout premier caractère passe tout de suite : sans ça, une réflexion plus
 * courte que le seuil n'apparaîtrait qu'à la fermeture du bloc, et les courtes
 * sont fréquentes.
 */
export function shouldFlushReasoning(block: ReasoningBlock): boolean {
  if (block.text.length === 0) {
    return false;
  }
  if (block.emittedLength === 0) {
    return true;
  }
  return block.text.length - block.emittedLength >= REASONING_FLUSH_CHARS;
}

export function markReasoningFlushed(block: ReasoningBlock): ReasoningBlock {
  return { ...block, emittedLength: block.text.length };
}

/**
 * L'id de l'activité, suffixé sur celui de l'événement qui ouvre le bloc.
 *
 * Le suffixe évite de heurter l'id de l'événement lui-même, tout en gardant le
 * même préfixe — donc la même place dans un tri par id.
 */
export function reasoningActivityId(openingEventId: string): string {
  return `${openingEventId}#reasoning`;
}

/**
 * Fabrique l'activité à envoyer. `sequence` n'est posé que si on en a un : une
 * activité SANS sequence se trie avant toutes celles qui en ont, donc en
 * poser un faux la placerait au mauvais endroit, et l'omettre quand le flux en
 * fournit un la ferait remonter en tête du fil.
 */
export function reasoningActivity(input: {
  readonly turnId: TurnId | null;
  readonly block: ReasoningBlock;
}): OrchestrationThreadActivity {
  const { block } = input;
  return {
    id: block.activityId as OrchestrationThreadActivity["id"],
    tone: "info",
    kind: REASONING_ACTIVITY_KIND,
    summary: REASONING_SUMMARY,
    payload: {
      /**
       * Le texte voyage sous le nom `detail`, et ce n'est pas un hasard : le
       * client extrait déjà `payload.detail` pour l'aperçu de ligne et pour le
       * corps repliable (`extractToolDetail`, `buildToolCallExpandedBody`).
       * Sous n'importe quel autre nom, il aurait fallu creuser un second
       * tuyau pour transporter la même chose.
       */
      detail: block.text,
      charCount: block.text.length,
      ...(block.truncated
        ? {
            truncated: true,
            droppedChars: block.droppedChars,
            limit: MAX_REASONING_CHARS,
          }
        : {}),
    },
    turnId: input.turnId,
    ...(block.sequence === undefined ? {} : { sequence: block.sequence }),
    createdAt: block.createdAt,
  } as OrchestrationThreadActivity;
}
