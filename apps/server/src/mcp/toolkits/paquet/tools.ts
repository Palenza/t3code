import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { HttpClient } from "effect/unstable/http";

/**
 * L'outil `paquet-malveillant` — demander AVANT de lancer, pas après.
 *
 * Chantier n°15, chaîne C. Aspiré de `tools/osv_check.py`, dont la vraie
 * trouvaille n'est pas « interroger OSV » mais **ce qu'on décide d'y
 * chercher** : uniquement les avis `MAL-*`, jamais les CVE.
 *
 * ── Pourquoi c'est un OUTIL et pas une porte automatique ──────────────────
 *
 * Chez eux, le contrôle s'insère avant le lancement d'un serveur MCP, parce
 * que c'est LEUR processus qui le lance. Chez nous, ce qui lance `npx` est le
 * `Bash` du SDK Claude Agent — un moteur qu'on ne possède pas, comme la
 * boucle d'agent elle-même (cf. n°25, n°30). Poser une porte demanderait un
 * hook sur un outil qui ne nous appartient pas.
 *
 * Alors on le dit tel quel plutôt que de faire semblant : c'est un outil que
 * l'agent convoque, pas une barrière qui l'arrête. Le jour où T3 possède un
 * point de passage sur l'exécution, la moitié pure (`PaquetALancer.ts`) s'y
 * branche sans changer une ligne — c'est pour ça qu'elle est séparée.
 *
 * ── Fail-open, et pourquoi c'est le bon défaut ICI ────────────────────────
 *
 * OSV injoignable ne bloque rien. Ailleurs dans ce dépôt on refuse plutôt que
 * de deviner ; ici l'inverse est juste, parce que le coût des deux erreurs
 * n'est pas comparable : refuser tout `npx` dès qu'un réseau hoquette rendrait
 * l'agent inutilisable, et la réponse serait de désactiver le contrôle. Un
 * contrôle désactivé protège de rien. Mais l'échec se DIT — jamais un vert
 * silencieux.
 */

export class PaquetError extends Schema.TaggedErrorClass<PaquetError>()("PaquetError", {
  message: Schema.String,
}) {}

export const PaquetInput = Schema.Struct({
  commande: Schema.String.annotate({
    description:
      "La commande telle qu'elle sera lancée, ex. `npx`, `pnpm`, `uvx`. Un chemin complet convient.",
  }),
  arguments: Schema.Array(Schema.String).annotate({
    description: 'Ses arguments, dans l\'ordre, ex. ["--yes", "@scope/outil@1.2.3"].',
  }),
});

export const PaquetResultat = Schema.Struct({
  /** `true` seulement sur un avis de MALVEILLANCE confirmé. */
  malveillant: Schema.Boolean,
  /** Ce qu'on a compris de la commande, ou `null` si elle ne télécharge rien. */
  paquet: Schema.NullOr(
    Schema.Struct({
      ecosysteme: Schema.String,
      nom: Schema.String,
      version: Schema.NullOr(Schema.String),
    }),
  ),
  /** Les identifiants `MAL-*` trouvés, avec leur résumé. */
  avis: Schema.Array(Schema.Struct({ id: Schema.String, resume: Schema.String })),
  /** La phrase à lire — le fait, puis le geste (A7). */
  verdict: Schema.String,
  note: Schema.optional(Schema.String),
});

export const PaquetTool = Tool.make("paquet-malveillant", {
  description:
    "Est-ce que ce paquet est un MALWARE connu ? Interroge OSV sur les seuls avis MAL-* — les paquets confirmés hostiles, pas les CVE ordinaires. À appeler AVANT tout `npx`, `bunx`, `pnpm dlx`, `uvx` ou `pipx` sur un paquet qu'on ne connaît pas : ces commandes téléchargent et exécutent en un geste, sans laisser de trace dans un package.json. Ne bloque rien, ne conclut jamais qu'un paquet est sain — seulement qu'OSV n'a rien.",
  parameters: PaquetInput,
  success: PaquetResultat,
  failure: PaquetError,
  // FileSystem et Path EN PLUS du réseau : la porte de sortie fait
  // déborder l'intégral sur disque au-dessus du plafond.
  dependencies: [HttpClient.HttpClient, FileSystem.FileSystem, Path.Path],
})
  .annotate(Tool.Title, "Paquet malveillant ?")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const PaquetToolkit = Toolkit.make(PaquetTool);
