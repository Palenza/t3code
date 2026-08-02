import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

/**
 * L'outil `repo_map` — la conscience-repo des agents (absorption aider,
 * chantier docs/CHANTIER-REPO-MAP.md).
 *
 * À LA DEMANDE, jamais injecté d'office : la divulgation progressive (leçon
 * claude-mem) — l'agent paie la carte quand il en a besoin, pas à chaque tour.
 */

export class RepoMapError extends Schema.TaggedErrorClass<RepoMapError>()("RepoMapError", {
  message: Schema.String,
}) {}

export const RepoMapInput = Schema.Struct({
  cwd: Schema.String.annotate({ description: "Racine ABSOLUE du dépôt à cartographier." }),
  focus: Schema.optional(
    Schema.Array(Schema.String).annotate({
      description:
        "Mots de la conversation (chemins, symboles) : les fichiers qui les portent remontent en tête.",
    }),
  ),
  maxChars: Schema.optional(
    Schema.Number.annotate({
      description: "Budget de la carte en caractères (~4 caractères par jeton). Défaut 12000.",
    }),
  ),
});

export const RepoMapResultat = Schema.Struct({
  carte: Schema.String,
  fichiersClasses: Schema.Number,
  lus: Schema.Number,
  caches: Schema.Number,
  ignoresTropGros: Schema.Number,
  /** Ce que la porte de sortie a changé — caviardage, dépassement de plafond. */
  note: Schema.optional(Schema.String),
});

export const RepoMapTool = Tool.make("repo_map", {
  description:
    "Carte du dépôt TypeScript : fichiers classés par centralité (qui est importé par qui) et par pertinence pour la conversation (focus), avec leurs symboles exportés. La carte, jamais le dump des fichiers — appeler AVANT de grepper au hasard. Bornée en caractères ; toute troncature est annoncée dans le texte.",
  parameters: RepoMapInput,
  success: RepoMapResultat,
  failure: RepoMapError,
  dependencies: [FileSystem.FileSystem, Path.Path],
})
  .annotate(Tool.Title, "Repo map")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const RepoToolkit = Toolkit.make(RepoMapTool);
