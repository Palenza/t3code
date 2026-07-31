import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { PreuveStore } from "../../../preuve/PreuveStore.ts";

/**
 * L'outil `preuve` — répondre à « qu'est-ce qui a été RÉELLEMENT prouvé ? ».
 *
 * Absorption d'Hermès (`verification_evidence.py`), chantier n°22. Leur
 * principe, repris tel quel : le registre est passif. Il ne lance rien, il ne
 * bloque rien, et il **ne transforme jamais une vérification ciblée en « tout
 * est vert »**.
 *
 * Chez nous il lit le flux d'activité que T3 enregistre déjà — aucune
 * instrumentation, aucune écriture.
 *
 * À quoi ça sert concrètement : avant de dire « c'est bon », on peut voir ce
 * qui a tourné, sur quoi, et avec quel verdict. C'est le reçu que la LOI
 * exige (A2 « pas de reçu, pas de chiffre » ; D3 « pas de diff, pas de fix »).
 */

export class PreuveError extends Schema.TaggedErrorClass<PreuveError>()("PreuveError", {
  message: Schema.String,
}) {}

export const PreuveInput = Schema.Struct({
  filId: Schema.String.annotate({
    description: "Le fil dont on veut le registre de preuve.",
  }),
});

const EtatRendu = Schema.Struct({
  nature: Schema.Literals(["tests", "types", "lint", "build"]),
  prouve: Schema.Boolean,
  detail: Schema.String,
});

const PreuveRendue = Schema.Struct({
  nature: Schema.String,
  etendue: Schema.Literals(["ciblee", "complete"]),
  verdict: Schema.Literals(["reussi", "echoue", "indetermine"]),
  raison: Schema.String,
  commande: Schema.String,
  quand: Schema.String,
});

export const PreuveResultat = Schema.Struct({
  /** Ce qu'on a le DROIT de dire, par nature de vérification. */
  etat: Schema.Array(EtatRendu),
  /** Le détail, du plus récent au plus ancien. */
  passages: Schema.Array(PreuveRendue),
  /** Une phrase honnête sur ce que ce registre couvre — et ne couvre pas. */
  note: Schema.String,
});

export const PreuveTool = Tool.make("preuve", {
  description:
    "Ce qui a été RÉELLEMENT vérifié dans ce fil : quelles commandes de test, typecheck, lint ou build ont tourné, sur quelle étendue (ciblée ou complète), et avec quel verdict. Ne lance rien, ne bloque rien. À appeler AVANT de dire « c'est bon » ou « tout est vert » — un passage ciblé au vert ne dit rien du reste du dépôt, et cet outil refuse de faire cette confusion.",
  parameters: PreuveInput,
  success: PreuveResultat,
  failure: PreuveError,
  dependencies: [PreuveStore],
})
  .annotate(Tool.Title, "Registre de preuve")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const PreuveToolkit = Toolkit.make(PreuveTool);
