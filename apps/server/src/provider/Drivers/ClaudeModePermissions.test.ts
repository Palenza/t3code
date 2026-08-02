import { MODES_LIVRES, type ModeTravail } from "@t3tools/shared/modesTravail";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { assert, describe, it } from "@effect/vitest";

import { appliquerModeAuHome } from "./ClaudeModePermissions.ts";

const modeParSlug = (slug: string): ModeTravail => {
  const mode = MODES_LIVRES.find((candidat) => candidat.slug === slug);
  if (mode === undefined) throw new Error(`mode ${slug} absent`);
  return mode;
};

const dansUnDossierNeuf = <A>(
  corps: (homePath: string) => Effect.Effect<A, never, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dossier = yield* fs.makeTempDirectoryScoped();
    return yield* corps(dossier);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const lire = (fichier: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(fichier).pipe(Effect.orElseSucceed(() => ""));
  });

describe("permissions d'un mode dans le dossier de l'instance", () => {
  it.effect("le mode Revue interdit l'écriture pour de vrai", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* appliquerModeAuHome(home, modeParSlug("revue"));

        const contenu = yield* lire(path.join(home, "settings.json"));
        // Les refus sont des NOMS NUS — le seul refus total que la CLI
        // garantit (doc : le nom nu retire l'outil du contexte).
        assert.include(contenu, '"Edit"');
        assert.include(contenu, '"Bash"');
        // La lecture reste ouverte, sinon le mode ne relit rien.
        assert.notInclude(contenu, '"Read"');
      }),
    ),
  );

  it.effect("un mode sans restriction efface notre trace", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fichier = path.join(home, "settings.json");
        yield* appliquerModeAuHome(home, modeParSlug("revue"));

        // Retour au mode libre : le fichier doit redevenir ce qu'il était,
        // sinon un périmètre posé une fois vaudrait pour toujours.
        yield* appliquerModeAuHome(home, modeParSlug("atelier"));

        const contenu = yield* lire(fichier);
        assert.notInclude(contenu, "permissions");
      }),
    ),
  );

  it.effect("les réglages déjà présents de l'utilisateur sont préservés", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fichier = path.join(home, "settings.json");
        yield* fs
          .writeFileString(fichier, '{"model":"opus","autreChose":42}')
          .pipe(Effect.orElseSucceed(() => undefined));

        yield* appliquerModeAuHome(home, modeParSlug("documentation"));

        const contenu = yield* lire(fichier);
        // Ce dossier appartient à l'utilisateur : on n'écrase pas ce qu'on
        // n'a pas écrit.
        assert.include(contenu, '"model"');
        assert.include(contenu, '"autreChose"');
        assert.include(contenu, "Edit(**/*.md)");
      }),
    ),
  );

  it.effect("un fichier abîmé n'est PAS réécrit à partir de rien", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fichier = path.join(home, "settings.json");
        yield* fs
          .writeFileString(fichier, "{ceci n'est pas du json")
          .pipe(Effect.orElseSucceed(() => undefined));

        yield* appliquerModeAuHome(home, modeParSlug("revue"));

        // Écraser les réglages d'un utilisateur pour appliquer un périmètre
        // serait un remède pire que le mal.
        const contenu = yield* lire(fichier);
        assert.strictEqual(contenu, "{ceci n'est pas du json");
      }),
    ),
  );
});

/**
 * LA POSE DIT CE QU'ELLE A FAIT — et surtout ce qu'elle N'A PAS fait.
 *
 * Ces trois cas séparent « ne pas échouer » de « avoir réussi ». Avant le
 * 03/08 la fonction était typée `Effect<void, never>` : les deux chemins de
 * panne ci-dessous rendaient exactement la même chose qu'un succès, et
 * l'appelant comptait chaque appel comme une application. La bannière ambre
 * pouvait donc affirmer « tes agents ne peuvent NI écrire NI lancer de
 * commande » sur un compte où rien n'avait été écrit.
 */
describe("la pose d'un mode rend son résultat réel", () => {
  it.effect("rend « applique » quand le fichier est bien écrit", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const resultat = yield* appliquerModeAuHome(home, modeParSlug("revue"));
        assert.strictEqual(resultat, "applique");
      }),
    ),
  );

  it.effect("rend « settings-illisible » sur un settings.json abîmé, sans l'écraser", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fichier = path.join(home, "settings.json");
        const abime = "{ ceci n'est pas du JSON";
        yield* fs.writeFileString(fichier, abime);

        const resultat = yield* appliquerModeAuHome(home, modeParSlug("revue"));

        assert.strictEqual(resultat, "settings-illisible");
        // Le fichier de l'utilisateur est INTACT : renoncer est le bon
        // remède, écraser ses réglages pour poser un périmètre serait pire
        // que le mal.
        assert.strictEqual(yield* lire(fichier), abime);
      }).pipe(Effect.orDie),
    ),
  );

  it.effect("rend « ecriture-refusee » quand le disque refuse d'écrire", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        // Un dossier en lecture seule : c'est le cas réel d'un `~/.claude-*`
        // monté par un autre utilisateur, ou d'un volume protégé.
        yield* fs.chmod(home, 0o500);
        const resultat = yield* appliquerModeAuHome(home, modeParSlug("revue")).pipe(
          Effect.ensuring(fs.chmod(home, 0o700).pipe(Effect.orElseSucceed(() => undefined))),
        );
        assert.strictEqual(resultat, "ecriture-refusee");
        assert.strictEqual(yield* lire(path.join(home, "settings.json")), "");
      }).pipe(Effect.orDie),
    ),
  );
});
