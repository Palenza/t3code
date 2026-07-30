import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { extraireFichier, type ExtraitFichier } from "./repoMapCore.ts";

/**
 * L'ÉCORCE DISQUE du repo map — la marche du workspace, avec mémoire.
 *
 * Le noyau est pur ; ici vivent les deux seules choses qui touchent le monde :
 * la marche (récursive, avec ÉLAGAGE — descendre dans node_modules pour le
 * filtrer ensuite coûterait des dizaines de milliers de stats) et le cache.
 *
 * Le cache retient l'EXTRACTION par (chemin, mtime), jamais le contenu : un
 * fichier inchangé ne se relit pas, et la mémoire porte quelques lignes par
 * fichier au lieu de mégaoctets. Un mtime qui bouge invalide seul son entrée.
 */

/** Dossiers jamais traversés — du généré ou de l'étranger, pas notre code. */
const DOSSIERS_IGNORES = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  ".next",
  "build",
  "coverage",
  "release",
  ".venv",
  ".turbo",
  ".claude",
  ".repos",
]);

/**
 * FIL-PIÈGE : au-delà, un .ts n'est pas écrit par un humain (bundle, généré).
 * REÇU : le plus gros source écrit main du dépôt fait ~150 ko
 * (`ClaudeAdapter.ts`, wc -c du 30/07) — la limite est posée à plus du double.
 * Les ignorés sont COMPTÉS et rendus à l'appelant (A7), jamais tus.
 */
const MAX_FICHIER_OCTETS = 384_000;

export interface ResultatBalayage {
  readonly extraits: ReadonlyArray<ExtraitFichier>;
  /** Lus et extraits ce coup-ci. */
  readonly lus: number;
  /** Servis depuis le cache (mtime inchangé). */
  readonly caches: number;
  /** Écartés par le fil-piège de taille — compté, jamais silencieux. */
  readonly ignoresTropGros: number;
}

interface EntreeCache {
  readonly mtimeMs: number;
  readonly extrait: ExtraitFichier;
}

/** Par workspace : deux dépôts balayés par le même serveur ne se mélangent pas. */
const caches = new Map<string, Map<string, EntreeCache>>();

/** Tests uniquement. */
export function viderCacheBalayage(): void {
  caches.clear();
}

const estSourceInteressante = (nom: string): boolean =>
  (nom.endsWith(".ts") || nom.endsWith(".tsx")) &&
  !nom.endsWith(".d.ts") &&
  !nom.endsWith(".gen.ts");

/**
 * Balaye un workspace et rend les extraits, cache à l'appui.
 *
 * Un dossier illisible ou un fichier disparu en cours de marche ne fait pas
 * échouer la carte : ce qui est lisible est cartographié, le reste est absent
 * — la carte dit « voilà ce que j'ai vu », jamais « voilà tout ce qui est ».
 */
export const balayerWorkspace = Effect.fn("balayerWorkspace")(function* (
  racine: string,
): Effect.fn.Return<ResultatBalayage, never, FileSystem.FileSystem | Path.Path> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const cache = caches.get(racine) ?? new Map<string, EntreeCache>();
  caches.set(racine, cache);

  const extraits: ExtraitFichier[] = [];
  let lus = 0;
  let servisCache = 0;
  let ignoresTropGros = 0;

  const pile: string[] = [racine];
  while (pile.length > 0) {
    const dossier = pile.pop();
    if (dossier === undefined) break;
    const entrees = yield* fs
      .readDirectory(dossier)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
    for (const nom of entrees) {
      const complet = path.join(dossier, nom);
      const info = yield* fs.stat(complet).pipe(Effect.orElseSucceed(() => null));
      if (info === null) continue;
      if (info.type === "Directory") {
        if (!DOSSIERS_IGNORES.has(nom) && !nom.startsWith(".")) pile.push(complet);
        continue;
      }
      if (info.type !== "File" || !estSourceInteressante(nom)) continue;
      if (Number(info.size) > MAX_FICHIER_OCTETS) {
        ignoresTropGros += 1;
        continue;
      }

      const mtimeMs = Option.getOrUndefined(info.mtime)?.getTime() ?? 0;
      // Chemin RELATIF à la racine, séparateur `/` : la clé du graphe et la
      // forme que le noyau attend, quel que soit l'OS.
      const relatif = path.relative(racine, complet).split(path.sep).join("/");

      const connu = cache.get(relatif);
      if (connu !== undefined && connu.mtimeMs === mtimeMs) {
        extraits.push(connu.extrait);
        servisCache += 1;
        continue;
      }
      const contenu = yield* fs.readFileString(complet).pipe(Effect.orElseSucceed(() => null));
      if (contenu === null) continue;
      const extrait = extraireFichier(relatif, contenu);
      cache.set(relatif, { mtimeMs, extrait });
      extraits.push(extrait);
      lus += 1;
    }
  }

  return { extraits, lus, caches: servisCache, ignoresTropGros };
});
