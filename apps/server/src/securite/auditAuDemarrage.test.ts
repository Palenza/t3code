import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import { auditerAuDemarrage } from "./auditAuDemarrage.ts";

/**
 * Monte une fausse installation et y pose les fichiers demandés, avec leur
 * vrai mode POSIX. On écrit sur un disque réel plutôt que de simuler `stat` :
 * ce qui est en cause ici est justement ce que le système d'exploitation
 * rapporte, et un faux `stat` ne prouverait que ma lecture du problème.
 */
const installation = Effect.fn("test.installation")(function* (
  fichiers: ReadonlyArray<{ readonly relatif: string; readonly mode: number }>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-audit-demarrage-" });
  const baseDir = path.join(home, ".t3");
  yield* fs.makeDirectory(path.join(baseDir, "userdata"), { recursive: true });

  for (const fichier of fichiers) {
    const chemin = path.join(baseDir, fichier.relatif);
    yield* fs.writeFileString(chemin, "{}");
    yield* fs.chmod(chemin, fichier.mode);
  }
  return { home, baseDir };
});

it.layer(NodeServices.layer)("audit de démarrage, branché", (it) => {
  it.effect("crie sur un jeton modifiable par n'importe qui — le cas réel", () =>
    Effect.gen(function* () {
      // Mesuré sur cette machine le 01/08 : `clerk-tokens.json` est en 0666,
      // écrit ainsi par `@clerk/electron/storage`. Un autre compte de la
      // machine peut REMPLACER le jeton, pas seulement le lire.
      const { home, baseDir } = yield* installation([
        { relatif: "userdata/clerk-tokens.json", mode: 0o666 },
      ]);
      const constats = yield* auditerAuDemarrage.pipe(
        Effect.provide(ServerConfig.layerTest(home, baseDir)),
      );

      const jeton = constats.find((c) => c.chemin?.includes("clerk-tokens.json"));
      assert.isDefined(jeton);
      assert.equal(jeton?.gravite, "grave");
      assert.include(jeton?.quoi ?? "", "MODIFIER");
      assert.include(jeton?.quoi ?? "", "rw-rw-rw-");
      // Le geste : le mode attendu est nommé, pas sous-entendu (A7).
      assert.include(jeton?.quoi ?? "", "rw-------");
    }).pipe(Effect.scoped),
  );

  it.effect("RESSERRE le mode à 0600 — et le constat reste quand même", () =>
    Effect.gen(function* () {
      // Les deux, et c'est le point. Réparer sans le dire ferait croire que
      // c'est réglé jusqu'à la prochaine écriture de `@clerk/electron`, qui
      // repose le fichier en 0666. Dire sans réparer laisserait le trou
      // ouvert entre deux lectures du journal.
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { home, baseDir } = yield* installation([
        { relatif: "userdata/clerk-tokens.json", mode: 0o666 },
      ]);

      const constats = yield* auditerAuDemarrage.pipe(
        Effect.provide(ServerConfig.layerTest(home, baseDir)),
      );

      // Le constat est là — l'audit n'a pas avalé le problème en le réparant.
      assert.isDefined(constats.find((c) => c.chemin?.includes("clerk-tokens.json")));

      // Et le fichier est resserré.
      const apres = yield* fs.stat(path.join(baseDir, "userdata/clerk-tokens.json"));
      assert.equal(Number(apres.mode) & 0o777, 0o600);
    }).pipe(Effect.scoped),
  );

  it.effect("ne resserre QUE ce qui a été constaté trop ouvert", () =>
    Effect.gen(function* () {
      // Ce n'est pas un durcissement général du disque : un fichier sain ne
      // doit pas voir son mode changer, sinon l'audit devient un outil qui
      // touche à des choses dont il n'a pas parlé.
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { home, baseDir } = yield* installation([
        { relatif: "userdata/clerk-tokens.json", mode: 0o600 },
        { relatif: "userdata/settings.json", mode: 0o644 },
      ]);

      yield* auditerAuDemarrage.pipe(Effect.provide(ServerConfig.layerTest(home, baseDir)));

      // `settings.json` était en 0644 : constaté, donc resserré.
      const carte = yield* fs.stat(path.join(baseDir, "userdata/settings.json"));
      assert.equal(Number(carte.mode) & 0o777, 0o600);
      // `clerk-tokens.json` était déjà sain : aucun constat, donc pas touché.
      const jeton = yield* fs.stat(path.join(baseDir, "userdata/clerk-tokens.json"));
      assert.equal(Number(jeton.mode) & 0o777, 0o600);
    }).pipe(Effect.scoped),
  );

  it.effect("se tait quand les modes sont sains", () =>
    Effect.gen(function* () {
      // Un audit qui parle à chaque démarrage devient un bruit qu'on filtre —
      // et c'est le jour où il a raison qu'on ne le lit plus.
      const { home, baseDir } = yield* installation([
        { relatif: "userdata/clerk-tokens.json", mode: 0o600 },
        { relatif: "userdata/settings.json", mode: 0o600 },
      ]);
      const constats = yield* auditerAuDemarrage.pipe(
        Effect.provide(ServerConfig.layerTest(home, baseDir)),
      );
      assert.deepEqual(constats, []);
    }).pipe(Effect.scoped),
  );

  it.effect("un fichier ABSENT n'est pas un constat", () =>
    Effect.gen(function* () {
      // Il n'existe pas encore, ou cette installation ne s'en sert pas.
      // Inventer un constat là-dessus apprendrait à ignorer les vrais.
      const { home, baseDir } = yield* installation([]);
      const constats = yield* auditerAuDemarrage.pipe(
        Effect.provide(ServerConfig.layerTest(home, baseDir)),
      );
      assert.deepEqual(constats, []);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "la carte de l'installation lisible par autrui est un avertissement, pas un drame",
    () =>
      Effect.gen(function* () {
        // `settings.json` est en 0644 sur cette machine. Il ne porte pas de
        // secret — il dit OÙ vivent les comptes. Le classer « grave » à côté
        // d'un jeton en écriture libre diluerait le mot.
        const { home, baseDir } = yield* installation([
          { relatif: "userdata/settings.json", mode: 0o644 },
        ]);
        const constats = yield* auditerAuDemarrage.pipe(
          Effect.provide(ServerConfig.layerTest(home, baseDir)),
        );
        assert.lengthOf(constats, 1);
        assert.equal(constats[0]?.gravite, "avertissement");
        assert.include(constats[0]?.quoi ?? "", "LIRE");
      }).pipe(Effect.scoped),
  );
});
