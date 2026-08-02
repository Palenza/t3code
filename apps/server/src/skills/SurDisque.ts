/**
 * LES SKILLS TELLES QU'ELLES SONT SUR LE DISQUE.
 *
 * La découverte existe déjà (`discoverClaudeSkills`) : elle rend le nom, la
 * description et le chemin. Il manque une seule chose au jugement d'usage —
 * DEPUIS QUAND la skill existe. Sans ça, « aucun appel » ne peut pas être
 * distingué de « on n'a pas regardé assez longtemps ».
 *
 * ── Pourquoi `birthtime` et jamais `mtime` ────────────────────────────────
 *
 * `mtime` est la dernière ÉCRITURE. L'utiliser comme date de naissance
 * rajeunirait toute skill qu'on vient de corriger — et une skill rajeunie
 * tombe du bon côté de la fenêtre, donc devient archivable. L'erreur pousse
 * exactement dans la direction dangereuse.
 *
 * `birthtime` est un `Option` chez Effect, et il est indisponible sur
 * certains systèmes de fichiers. Absent, on rend `null` — et le module de
 * jugement répond alors `indécidable`, jamais « inutilisée ». La panne par
 * défaut est le silence, pas la suppression.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import type { ClaudeSettings } from "@t3tools/contracts";
import { discoverClaudeSkills } from "../provider/Drivers/ClaudeSkills.ts";
import type { SkillSurDisque } from "./UsageDesSkills.ts";

export interface SkillDecrite extends SkillSurDisque {
  readonly description: string | undefined;
  readonly chemin: string;
  readonly scope: string | undefined;
}

/**
 * Les skills visibles, avec leur date de naissance.
 *
 * `epinglees` est explicite et vient de l'appelant : T3 n'a pas encore
 * d'endroit où ranger cette liste, et en inventer un avant que le curateur
 * (n°1) existe serait résoudre un problème qu'on n'a pas.
 */
export const skillsSurDisque = Effect.fn("skillsSurDisque")(function* (input: {
  readonly config: Pick<ClaudeSettings, "homePath">;
  readonly cwd?: string | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly epinglees?: ReadonlyArray<string> | undefined;
}): Effect.fn.Return<ReadonlyArray<SkillDecrite>, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const epinglees = new Set(input.epinglees ?? []);
  const trouvees = yield* discoverClaudeSkills(input.config, input.cwd, input.environment);

  return yield* Effect.forEach(trouvees, (skill) =>
    Effect.gen(function* () {
      const info = yield* fileSystem.stat(skill.path).pipe(Effect.orElseSucceed(() => null));
      const naissance = info === null ? Option.none<Date>() : info.birthtime;
      return {
        nom: skill.name,
        neLe: Option.match(naissance, {
          onNone: () => null,
          onSome: (date) => {
            const ms = date.getTime();
            // Un `birthtime` à l'époque zéro veut dire « pas de réponse », pas
            // « née en 1970 » : c'est ce que rendent les systèmes de fichiers
            // qui ne le tiennent pas.
            return Number.isNaN(ms) || ms <= 0 ? null : ms;
          },
        }),
        epinglee: epinglees.has(skill.name),
        description: skill.description,
        chemin: skill.path,
        scope: skill.scope,
      } satisfies SkillDecrite;
    }),
  );
});
