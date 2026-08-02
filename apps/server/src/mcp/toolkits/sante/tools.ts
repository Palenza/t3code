import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ServerConfig from "../../../config.ts";
import { ServerSettingsService } from "../../../serverSettings.ts";

/**
 * L'outil `sante` — la BOUCHE du doctor.
 *
 * Le module de diagnostic existait (chantier n°13, `doctor/Diagnostic.ts`),
 * complet et testé. Personne ne l'appelait. Un module pur sans appelant n'est
 * pas une fonctionnalité livrée : c'est du code mort qui ressemble à du code
 * vivant, et c'est précisément le mode de panne que la LOI nomme A5b — « le
 * correctif qui a l'air fait et ne l'est pas ».
 *
 * Preuve que ça coûtait quelque chose, mesurée le jour du branchement : la
 * table d'index de rappel (`thread_messages_fts`, migration 036) était absente
 * des DEUX bases de cette machine. Le doctor avait la phrase exacte — « la
 * table n'existe pas → relance le serveur pour que la migration s'applique » —
 * et aucun moyen de la dire.
 *
 * ── Pourquoi un outil MCP et pas un écran ─────────────────────────────────
 *
 * Celui qui se cogne à ces pannes est l'AGENT, en plein travail : un compte
 * épuisé, un index qui a dérivé, une panne qui revient. Il a besoin du geste,
 * pas d'un voyant à regarder. Un écran demande qu'on pense à l'ouvrir ; un
 * outil se convoque au moment où ça casse.
 */

export class SanteError extends Schema.TaggedErrorClass<SanteError>()("SanteError", {
  message: Schema.String,
}) {}

export const SanteInput = Schema.Struct({});

const ConstatRendu = Schema.Struct({
  sujet: Schema.String,
  gravite: Schema.Literals(["ok", "attention", "casse"]),
  /** Ce qui a été MESURÉ. Jamais une impression. */
  observe: Schema.String,
  /** Le geste qui répare. Vide seulement quand tout va bien. */
  geste: Schema.String,
});

export const SanteResultat = Schema.Struct({
  /** Le pire des constats : `casse` prime sur `attention` qui prime sur `ok`. */
  verdict: Schema.Literals(["ok", "attention", "casse"]),
  constats: Schema.Array(ConstatRendu),
  /** Ce que ce passage a regardé — et ce qu'il n'a PAS regardé (H4). */
  note: Schema.String,
});

export const SanteTool = Tool.make("sante", {
  description:
    "Ce qui est cassé dans T3 en ce moment, et le geste qui le répare : comptes épuisés ou déconnectés, index de rappel qui a dérivé, pannes qui reviennent. Ne répare rien tout seul. À appeler quand un fournisseur échoue sans raison claire, quand une recherche de rappel ne trouve plus rien, ou avant de conclure « c'est l'API qui déconne ».",
  parameters: SanteInput,
  success: SanteResultat,
  failure: SanteError,
  dependencies: [SqlClient.SqlClient, FileSystem.FileSystem, Path.Path],
})
  .annotate(Tool.Title, "Santé de T3")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

/**
 * L'outil `inventaire` — la bouche du chantier n°59.
 *
 * Le doctor DIAGNOSTIQUE, l'inventaire DÉCRIT. Deux métiers, et les confondre
 * donnerait un outil qui répond mal aux deux questions : « qu'est-ce qui est
 * cassé ? » et « c'est quoi, ton installation ? ».
 *
 * La contrainte qui décide de sa forme : un inventaire est fait pour être
 * COLLÉ — dans un message, une issue, un rapport de bug, c'est-à-dire dans un
 * endroit d'où on ne peut plus le retirer. Donc aucune valeur n'y entre. Les
 * variables d'environnement par NOM, les chemins sans le nom de session. Il
 * n'y a rien à caviarder parce qu'il n'y a rien à cacher — c'est plus sûr
 * qu'un caviardage qui pourrait rater un cas.
 */
export const InventaireInput = Schema.Struct({});

export const InventaireResultat = Schema.Struct({
  /** Le texte prêt à coller. Aucune valeur de secret n'y figure. */
  texte: Schema.String,
  /** Ce qui mérite un regard tout de suite, ou `null` si rien. */
  saillant: Schema.NullOr(Schema.String),
  /** Ce que cet inventaire ne couvre PAS — et par où passe la porte de sortie. */
  note: Schema.optional(Schema.String),
});

export const InventaireTool = Tool.make("inventaire", {
  description:
    "L'installation en une page prête à coller dans un rapport : versions, plateforme, comptes configurés et lequel est actif, nombre de skills, poids de l'état sur disque, variables d'environnement PRÉSENTES (par nom, jamais leur valeur). Ne dit pas ce qui est cassé — pour ça, `sante`.",
  parameters: InventaireInput,
  success: InventaireResultat,
  failure: SanteError,
  dependencies: [
    FileSystem.FileSystem,
    Path.Path,
    ServerConfig.ServerConfig,
    ServerSettingsService,
  ],
})
  .annotate(Tool.Title, "Inventaire de l'installation")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const SanteToolkit = Toolkit.make(SanteTool, InventaireTool);
