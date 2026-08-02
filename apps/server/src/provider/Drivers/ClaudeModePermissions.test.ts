import { MODES_LIVRES, type ModeTravail } from "@t3tools/shared/modesTravail";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { assert, describe, it } from "@effect/vitest";

import { appliquerModeAuHome, lireModeDuHome } from "./ClaudeModePermissions.ts";

/** Le même codec que le module testé : la lecture ne doit pas être un autre outil. */
const SETTINGS = Schema.Record(Schema.String, Schema.Unknown);
const lireSettings = Schema.decodeUnknownSync(Schema.fromJsonString(SETTINGS));
const ecrireSettings = Schema.encodeSync(Schema.fromJsonString(SETTINGS));

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

/**
 * LE FICHIER DE L'UTILISATEUR SURVIT — ce qu'on n'a pas posé, on n'y touche pas.
 *
 * Le mode Atelier n'impose aucune restriction, donc ne produit aucune règle,
 * donc tombait dans la branche « rien à restreindre » et SUPPRIMAIT le bloc
 * `permissions` entier : refus personnels, `defaultMode`,
 * `additionalDirectories`. Le mode qui promet de ne rien restreindre était le
 * plus destructeur du catalogue — et la perte était définitive, sur le disque.
 */
describe("poser un mode n'efface jamais les réglages de l'utilisateur", () => {
  const reglagesPersonnels = {
    permissions: {
      deny: ["Bash(rm:*)", "Read(**/.env)"],
      allow: ["Bash(git status:*)"],
      ask: ["Bash(git push:*)"],
      defaultMode: "acceptEdits",
      additionalDirectories: ["/Users/enzo/Documents/Palenza"],
    },
    statusLine: { type: "command", command: "echo bonjour" },
  };

  const avecReglages = <A>(
    corps: (
      home: string,
      fichier: string,
    ) => Effect.Effect<A, never, FileSystem.FileSystem | Path.Path>,
  ) =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fichier = path.join(home, "settings.json");
        yield* fs.writeFileString(fichier, ecrireSettings(reglagesPersonnels));
        return yield* corps(home, fichier);
      }).pipe(Effect.orDie),
    );

  const permissionsDe = (contenu: string) =>
    (lireSettings(contenu)["permissions"] as Record<string, unknown> | undefined) ?? {};

  it.effect("le mode Atelier NE SUPPRIME PLUS le bloc permissions", () =>
    avecReglages((home, fichier) =>
      Effect.gen(function* () {
        const resultat = yield* appliquerModeAuHome(home, modeParSlug("atelier"));
        assert.strictEqual(resultat, "applique");

        const perms = permissionsDe(yield* lire(fichier));
        assert.deepStrictEqual(perms["deny"], ["Bash(rm:*)", "Read(**/.env)"]);
        assert.deepStrictEqual(perms["allow"], ["Bash(git status:*)"]);
        assert.deepStrictEqual(perms["ask"], ["Bash(git push:*)"]);
        assert.strictEqual(perms["defaultMode"], "acceptEdits");
        assert.deepStrictEqual(perms["additionalDirectories"], ["/Users/enzo/Documents/Palenza"]);
      }),
    ),
  );

  it.effect("un mode restrictif AJOUTE ses refus sans jeter ceux de l'utilisateur", () =>
    avecReglages((home, fichier) =>
      Effect.gen(function* () {
        yield* appliquerModeAuHome(home, modeParSlug("revue"));

        const perms = permissionsDe(yield* lire(fichier));
        const deny = perms["deny"] as ReadonlyArray<string>;
        assert.include(deny, "Bash(rm:*)", "le refus personnel a été jeté");
        assert.include(deny, "Read(**/.env)", "le refus personnel a été jeté");
        assert.include(deny, "Edit", "le mode n'a pas posé son refus");
        assert.strictEqual(perms["defaultMode"], "acceptEdits");
      }),
    ),
  );

  it.effect("lever le mode rend le fichier EXACTEMENT à son état d'origine", () =>
    avecReglages((home, fichier) =>
      Effect.gen(function* () {
        const origine = yield* lire(fichier);
        yield* appliquerModeAuHome(home, modeParSlug("revue"));
        yield* appliquerModeAuHome(home, modeParSlug("documentation"));
        yield* appliquerModeAuHome(home, null);

        // Aller-retour complet : le contenu doit se superposer à l'original.
        // Une comparaison de VALEURS, pas de texte : le formatage appartient
        // à l'encodeur, la matière appartient à l'utilisateur.
        assert.deepStrictEqual(lireSettings(yield* lire(fichier)), lireSettings(origine));
      }),
    ),
  );

  it.effect("sans bloc permissions, poser puis lever ne LAISSE aucune trace", () =>
    dansUnDossierNeuf((home) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const fichier = path.join(home, "settings.json");
        yield* fs.writeFileString(fichier, ecrireSettings({ statusLine: { type: "none" } }));

        yield* appliquerModeAuHome(home, modeParSlug("revue"));
        yield* appliquerModeAuHome(home, null);

        const relu = lireSettings(yield* lire(fichier));
        assert.notProperty(relu, "permissions", "un bloc vide est resté derrière nous");
        assert.property(relu, "statusLine");
      }).pipe(Effect.orDie),
    ),
  );

  it.effect("le mode reste RECONNAISSABLE malgré les entrées de l'utilisateur", () =>
    avecReglages((home) =>
      Effect.gen(function* () {
        // La reconnaissance comparait les listes ENTIÈRES. Depuis qu'on
        // fusionne, elles contiennent aussi celles de l'utilisateur : sans
        // filtrage, l'écran dirait « aucun mode » alors que le mode est posé.
        yield* appliquerModeAuHome(home, modeParSlug("revue"));
        const relu = yield* lireModeDuHome(home, MODES_LIVRES);
        assert.strictEqual(relu?.slug, "revue");
      }),
    ),
  );
});
