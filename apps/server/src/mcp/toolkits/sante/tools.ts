import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

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

export const SanteToolkit = Toolkit.make(SanteTool);
