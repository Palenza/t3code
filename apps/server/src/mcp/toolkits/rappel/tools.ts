import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { RappelStore } from "../../../rappel/RappelStore.ts";

/**
 * L'outil `rappel` — retrouver une conversation passée.
 *
 * Absorption d'Hermès (`tools/session_search_tool.py`), chantier n°5 du
 * catalogue. Jusqu'ici, tout ce qui n'était pas dans le fil ouvert était
 * perdu : la recherche de T3 fouille les FICHIERS du projet, jamais les
 * conversations.
 *
 * LA DÉCISION D'INTERFACE, et c'est leur meilleure : **une seule forme
 * d'outil, trois modes DÉDUITS des arguments**. Pas de paramètre `mode`.
 * Moins de champs, moins de façons de se tromper — et l'agent n'a pas à
 * choisir un mode avant de savoir ce qu'il cherche.
 *
 * Coût modèle : ZÉRO. FTS5 rend les messages eux-mêmes ; rien n'est résumé,
 * rien n'est ré-inféré. On ne paie que du disque.
 */

export class RappelError extends Schema.TaggedErrorClass<RappelError>()("RappelError", {
  message: Schema.String,
}) {}

export const RappelInput = Schema.Struct({
  question: Schema.optional(
    Schema.String.annotate({
      description:
        "Ce qu'on cherche, en mots simples. Déclenche la DÉCOUVERTE : un résultat par fil, la fenêtre autour de la trouvaille, et les bornes du fil pour s'orienter.",
    }),
  ),
  filId: Schema.optional(
    Schema.String.annotate({
      description:
        "Avec `autourDe` : DÉFILEMENT dans ce fil. Pour remonter ou descendre, se réancrer sur le premier ou le dernier message rendu.",
    }),
  ),
  autourDe: Schema.optional(
    Schema.String.annotate({
      description: "Identifiant du message servant d'ancre au défilement.",
    }),
  ),
});

const MessageRendu = Schema.Struct({
  messageId: Schema.String,
  role: Schema.String,
  texte: Schema.String,
  creeA: Schema.String,
});

const FilTrouve = Schema.Struct({
  filId: Schema.String,
  titre: Schema.String,
  archive: Schema.Boolean,
  /** Le message qui a déclenché la trouvaille. */
  ancre: Schema.String,
  /** ±5 messages autour — une phrase seule ne se comprend pas. */
  fenetre: Schema.Array(MessageRendu),
  /** Les 3 premiers du fil : de quoi partait la conversation. */
  debutDuFil: Schema.Array(MessageRendu),
  /** Les 3 derniers : où elle a abouti. */
  finDuFil: Schema.Array(MessageRendu),
});

export const RappelResultat = Schema.Struct({
  mode: Schema.Literals(["decouverte", "defilement", "parcours"]),
  /** Mode découverte. */
  fils: Schema.Array(FilTrouve),
  /** Mode défilement. */
  fenetre: Schema.Array(MessageRendu),
  /** Mode parcours. */
  recents: Schema.Array(
    Schema.Struct({
      filId: Schema.String,
      titre: Schema.String,
      majA: Schema.String,
      archive: Schema.Boolean,
    }),
  ),
  /** Ce que l'outil a fait, en une phrase — pour que l'agent sache quoi relancer. */
  note: Schema.String,
});

export const RappelTool = Tool.make("rappel", {
  description:
    "Retrouve une conversation PASSÉE (pas les fichiers du projet — pour ça, repo_map ou une recherche de code). Trois modes déduits des arguments : `question` cherche partout et rend un résultat par fil avec son contexte ; `filId`+`autourDe` défile dans un fil ; sans argument, liste les fils récents. Coût modèle nul : rend les messages réels, jamais un résumé. À appeler quand on dit « on en avait parlé », « comme la dernière fois », ou avant de re-décider quelque chose qui a peut-être déjà été tranché.",
  parameters: RappelInput,
  success: RappelResultat,
  failure: RappelError,
  dependencies: [RappelStore],
})
  .annotate(Tool.Title, "Rappel de conversations")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const RappelToolkit = Toolkit.make(RappelTool);
