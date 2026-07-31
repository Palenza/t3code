import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { RefusStore } from "../../../securite/RefusStore.ts";

/**
 * L'outil `autorisations-suggerees` — chantier n°12.
 *
 * Leur `approvals_suggest.py` compte les refus et propose les plus fréquents.
 * On garde l'idée, on inverse la charge de la preuve : ce module est le seul
 * de la maison qui propose d'OUVRIR une frontière de sécurité, alors que tous
 * les autres gardes en ferment une.
 *
 * ── Ce que la vraie donnée a montré, et qui change le produit ─────────────
 *
 * Sur les 13 refus réellement enregistrés (7,4 jours) :
 *
 *   · 12 sont tombés LE MÊME JOUR — un compteur brut y lirait « motif
 *     écrasant » là où il y a un après-midi ;
 *   · 8 sur 13 sont des chaînes shell (`&&`, `|`, `<(…)`), dont le début ment
 *     sur la suite : aucune entrée d'allowlist étroite n'aurait pu les
 *     couvrir.
 *
 * Autrement dit, la réponse honnête aujourd'hui est ZÉRO suggestion — et la
 * VALEUR est dans les raisons, pas dans la liste vide.
 */
export class SuggestionsError extends Schema.TaggedErrorClass<SuggestionsError>()(
  "SuggestionsError",
  { message: Schema.String },
) {}

export const SuggestionsInput = Schema.Struct({
  /**
   * Ce qui est DÉJÀ autorisé, sous la forme `git status`. Reproposer de
   * l'acquis ferait douter de tout le reste de la liste.
   */
  dejaAutorise: Schema.optional(Schema.Array(Schema.String)),
});

const SuggestionRendue = Schema.Struct({
  forme: Schema.String,
  outil: Schema.String,
  occasions: Schema.Number,
  jours: Schema.Number,
  exemples: Schema.Array(Schema.String),
});

const EcartRendu = Schema.Struct({
  quoi: Schema.String,
  pourquoi: Schema.String,
});

export const SuggestionsResultat = Schema.Struct({
  suggestions: Schema.Array(SuggestionRendue),
  /** La moitié utile quand la liste est vide : POURQUOI elle est vide. */
  ecartes: Schema.Array(EcartRendu),
  resume: Schema.String,
  note: Schema.optional(Schema.String),
});

export const SuggestionsTool = Tool.make("autorisations-suggerees", {
  description:
    "Qu'est-ce qu'il faudrait autoriser, au vu des outils réellement refusés ? Exige un motif ÉTABLI (plusieurs occasions, sur plusieurs jours distincts) et ne propose jamais une commande destructrice, une chaîne shell, ni un outil nu — la fréquence n'est pas un consentement. N'autorise rien : rend des propositions à reprendre par un humain. Quand il ne propose rien, ses raisons sont le résultat.",
  parameters: SuggestionsInput,
  success: SuggestionsResultat,
  failure: SuggestionsError,
  dependencies: [RefusStore, FileSystem.FileSystem, Path.Path],
})
  .annotate(Tool.Title, "Autorisations suggérées")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const SuggestionsToolkit = Toolkit.make(SuggestionsTool);
