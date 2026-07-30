import { reglesPour, type ModeTravail } from "@t3tools/shared/modesTravail";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

/**
 * Applique le périmètre d'un mode en PERMISSIONS de la CLI.
 *
 * C'est le geste qui fait la différence entre un garde-fou et un vœu. Le mode
 * dit « tu n'écris que dans les .md » ; sans ce fichier, c'est une phrase dans
 * un prompt que l'agent peut mal lire ou oublier. Avec, c'est la CLI
 * elle-même qui refuse l'écriture — l'agent ne peut plus se tromper, il peut
 * seulement constater.
 *
 * Écrit dans le `settings.json` du dossier de configuration de l'instance,
 * celui que `CLAUDE_CONFIG_DIR` désigne déjà. Une seule clé est touchée —
 * `permissions` — et tout le reste du fichier est préservé : ce dossier
 * appartient à l'utilisateur, on n'y écrase pas ce qu'on n'a pas écrit.
 */

const SettingsInconnus = Schema.Record(Schema.String, Schema.Unknown);
const decodeSettings = Schema.decodeUnknownSync(Schema.fromJsonString(SettingsInconnus));
const encodeSettings = Schema.encodeSync(Schema.fromJsonString(SettingsInconnus));

/**
 * Écrit — ou retire — les permissions du mode dans le dossier de l'instance.
 *
 * `mode` à `null` REND la liberté : c'est le cas du mode Atelier et de
 * l'absence de mode. Sans ce retrait, un périmètre posé une fois resterait
 * en vigueur pour toujours, et l'utilisateur chercherait longtemps pourquoi
 * son agent refuse d'écrire.
 */
/**
 * RELIT le mode posé sur le disque, pour un dossier de compte donné.
 *
 * Le mode ne vivait qu'en mémoire du serveur, alors que ses refus, eux, sont
 * écrits sur le disque. Au redémarrage l'écran redevenait donc gris — « aucun
 * mode » — pendant que la CLI continuait d'appliquer les refus. Les agents
 * répondaient « Bash exists but is not enabled in this context » et rien
 * n'expliquait pourquoi. Une heure de diagnostic à l'aveugle, payée le 30/07.
 *
 * Le disque fait foi. On le relit.
 */
export const lireModeDuHome = Effect.fn("lireModeDuHome")(function* (
  homePath: string,
  candidats: ReadonlyArray<ModeTravail>,
): Effect.fn.Return<ModeTravail | null, never, Path.Path | FileSystem.FileSystem> {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const brut = yield* fs
    .readFileString(path.join(homePath, "settings.json"))
    .pipe(Effect.orElseSucceed(() => ""));
  if (brut.trim().length === 0) return null;

  let permissions: { deny?: unknown; allow?: unknown } | null = null;
  try {
    const lu = decodeSettings(brut);
    const p = lu["permissions"];
    permissions = typeof p === "object" && p !== null ? (p as { deny?: unknown; allow?: unknown }) : null;
  } catch {
    return null;
  }
  if (permissions === null) return null;

  const enTexte = (valeur: unknown) =>
    Array.isArray(valeur) ? [...valeur].filter((v): v is string => typeof v === "string").sort() : [];
  const denyLu = enTexte(permissions.deny);
  const allowLu = enTexte(permissions.allow);
  if (denyLu.length === 0 && allowLu.length === 0) return null;

  // On reconnaît le mode par ce qu'il PRODUIT, pas par un marqueur qu'on
  // aurait ajouté : un marqueur mentirait si l'utilisateur éditait le fichier
  // à la main, la signature des règles, non.
  const memeListe = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
    a.length === b.length && a.every((valeur, index) => valeur === b[index]);

  for (const mode of candidats) {
    const attendu = reglesPour(mode);
    if (
      memeListe([...attendu.deny].sort(), denyLu) &&
      memeListe([...attendu.allow].sort(), allowLu)
    ) {
      return mode;
    }
  }
  return null;
});

export const appliquerModeAuHome = Effect.fn("appliquerModeAuHome")(function* (
  homePath: string,
  mode: ModeTravail | null,
): Effect.fn.Return<void, never, Path.Path | FileSystem.FileSystem> {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const fichier = path.join(homePath, "settings.json");

  const existant = yield* fs.readFileString(fichier).pipe(
    Effect.map((brut) => {
      try {
        return decodeSettings(brut);
      } catch {
        // Fichier abîmé : on ne le réécrit PAS à partir de rien, on renonce.
        // Écraser les réglages d'un utilisateur pour appliquer un périmètre
        // serait un remède pire que le mal.
        return null;
      }
    }),
    Effect.orElseSucceed(() => ({}) as Record<string, unknown>),
  );
  if (existant === null) {
    yield* Effect.logWarning("mode: settings.json illisible, périmètre non appliqué", { fichier });
    return;
  }

  const regles = mode === null ? { deny: [], allow: [] } : reglesPour(mode);
  const suivant: Record<string, unknown> = { ...existant };
  if (regles.deny.length === 0 && regles.allow.length === 0) {
    // Rien à restreindre : on efface notre trace au lieu d'écrire un objet
    // vide, pour que le fichier redevienne exactement ce qu'il était.
    delete suivant["permissions"];
  } else {
    const permissionsExistantes =
      typeof existant["permissions"] === "object" && existant["permissions"] !== null
        ? (existant["permissions"] as Record<string, unknown>)
        : {};
    suivant["permissions"] = { ...permissionsExistantes, deny: regles.deny, allow: regles.allow };
  }

  yield* fs.makeDirectory(homePath, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
  yield* fs
    .writeFileString(fichier, `${encodeSettings(suivant)}\n`)
    .pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("mode: écriture des permissions impossible", { fichier, cause }),
      ),
    );
});
