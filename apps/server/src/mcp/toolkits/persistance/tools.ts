import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { DetteStore } from "../../../persistance/DetteStore.ts";

/**
 * L'outil `dette` — ce qui a été établi et n'existe nulle part.
 *
 * Absorption d'Hermès (`agent/memory_manager.py`), chantier n°9 : « l'agent se
 * rappelle d'écrire ce qu'il apprend ».
 *
 * Pourquoi il ne peut pas être une règle de texte : le 31/07, un catalogue de
 * 85 chantiers a vécu une journée entière dans une seule conversation, et le
 * compactage l'a emporté. La mesure du même jour dit que ce n'est pas
 * rattrapable — chaque compactage jette 97,5 à 98,6 % de la fenêtre, et TROIS
 * messages seulement survivent mot pour mot.
 *
 * Le seuil est un FIL-PIÈGE mesuré, pas une intuition : p95 = 9 tours sans
 * écriture, p99 = 22. À 12 tours ET 40 outils, il ne touche que 2 séries sur
 * 89 — précisément celles qui ont dépensé 106 et 184 outils sans produire un
 * fichier. Enquêter sans écrire reste normal, et le reste silencieux.
 */

export class DetteError extends Schema.TaggedErrorClass<DetteError>()("DetteError", {
  message: Schema.String,
}) {}

export const DetteInput = Schema.Struct({
  filId: Schema.String.annotate({
    description: "Le fil dont on veut mesurer la dette de persistance.",
  }),
});

export const DetteResultat = Schema.Struct({
  /** `true` seulement au-delà du fil-piège mesuré. */
  enDette: Schema.Boolean,
  /** Tours consécutifs sans aucune écriture de fichier. */
  tours: Schema.Number,
  /** Outils dépensés pendant ces tours. */
  outils: Schema.Number,
  /** Le fait, ses chiffres, et le geste exact (A7). */
  quoiFaire: Schema.String,
  /** Ce que cette mesure ne couvre pas — jamais tu. */
  note: Schema.optional(Schema.String),
});

export const DetteTool = Tool.make("dette", {
  description:
    "Combien de tours et d'outils se sont écoulés sans qu'aucun fichier soit écrit. Répond « en dette » seulement au-delà d'un seuil mesuré — enquêter sans écrire est normal. À appeler avant de clore un long chantier, ou quand la fenêtre de contexte se remplit : ce qui n'est pas sur disque ne survit pas au compactage.",
  parameters: DetteInput,
  success: DetteResultat,
  failure: DetteError,
  dependencies: [DetteStore],
})
  .annotate(Tool.Title, "Dette de persistance")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const DetteToolkit = Toolkit.make(DetteTool);
