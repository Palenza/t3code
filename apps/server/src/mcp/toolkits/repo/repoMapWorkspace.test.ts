import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { assert } from "vite-plus/test";

import { balayerWorkspace, viderCacheBalayage } from "./repoMapWorkspace.ts";

/** Secondes epoch FIXES (2099-01-01) : un mtime lu à l'horloge ne se rejoue pas. */
const FUTUR = 4_070_908_800;

describe("balayage du workspace", () => {
  it.effect(
    "élague node_modules et consorts, ne prend que les sources écrites main",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const racine = yield* fs.makeTempDirectoryScoped({ prefix: "carte-" });
        yield* fs.makeDirectory(path.join(racine, "src"), { recursive: true });
        yield* fs.makeDirectory(path.join(racine, "node_modules", "piege"), { recursive: true });
        yield* fs.writeFileString(path.join(racine, "src", "a.ts"), "export const a = 1;");
        yield* fs.writeFileString(path.join(racine, "src", "types.d.ts"), "export type T = 1;");
        yield* fs.writeFileString(
          path.join(racine, "node_modules", "piege", "b.ts"),
          "export const b = 1;",
        );

        viderCacheBalayage();
        const resultat = yield* balayerWorkspace(racine);
        assert.deepStrictEqual(
          resultat.extraits.map((e) => e.chemin),
          ["src/a.ts"],
          "ni le node_modules, ni le .d.ts",
        );
        viderCacheBalayage();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    { timeout: 20_000 },
  );

  it.effect(
    "le cache sert l'inchangé et se réveille au mtime — le cœur de l'économie",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const racine = yield* fs.makeTempDirectoryScoped({ prefix: "carte-" });
        const fichier = path.join(racine, "m.ts");
        yield* fs.writeFileString(fichier, "export const avant = 1;");

        viderCacheBalayage();
        const premier = yield* balayerWorkspace(racine);
        assert.strictEqual(premier.lus, 1);
        assert.strictEqual(premier.caches, 0);

        const second = yield* balayerWorkspace(racine);
        assert.strictEqual(second.lus, 0, "rien n'a bougé : rien ne se relit");
        assert.strictEqual(second.caches, 1);

        yield* fs.writeFileString(fichier, "export const apres = 2;");
        yield* fs.utimes(fichier, FUTUR, FUTUR);
        const troisieme = yield* balayerWorkspace(racine);
        assert.strictEqual(troisieme.lus, 1, "le mtime a bougé : on relit");
        assert.ok(
          troisieme.extraits[0]?.definitions[0]?.includes("apres"),
          "et l'extraction est bien la NOUVELLE",
        );
        viderCacheBalayage();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    { timeout: 20_000 },
  );

  it.effect(
    "le fil-piège de taille COMPTE ce qu'il écarte — jamais un silence (A7)",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const racine = yield* fs.makeTempDirectoryScoped({ prefix: "carte-" });
        yield* fs.writeFileString(path.join(racine, "normal.ts"), "export const ok = 1;");
        yield* fs.writeFileString(
          path.join(racine, "genere.ts"),
          "export const gros = 1;\n" + "//x\n".repeat(200_000),
        );

        viderCacheBalayage();
        const resultat = yield* balayerWorkspace(racine);
        assert.strictEqual(resultat.ignoresTropGros, 1, "l'écarté est COMPTÉ");
        assert.deepStrictEqual(
          resultat.extraits.map((e) => e.chemin),
          ["normal.ts"],
        );
        viderCacheBalayage();
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    { timeout: 20_000 },
  );
});
