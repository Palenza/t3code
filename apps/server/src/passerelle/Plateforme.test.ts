import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { TELEGRAM } from "./DebiterVersUneMessagerie.ts";
import { plateformeDe, registre, type Plateforme } from "./Plateforme.ts";
import { racineDesSources } from "../racineDesSources.ts";

const fausse = (nom: string): Plateforme => ({
  nom,
  limites: TELEGRAM,
  lire: () => null,
  envoyer: () => Promise.resolve({ ok: true, identifiantDuMessage: "1" }),
  editer: () => Promise.resolve({ ok: true, identifiantDuMessage: "1" }),
});

describe("le registre", () => {
  it("retrouve une plateforme par son nom", () => {
    const r = registre([fausse("telegram"), fausse("discord")]);
    const trouve = plateformeDe(r, "discord");
    assert.property(trouve, "trouvee");
  });

  it("un doublon est une ERREUR, pas un cas à arbitrer", () => {
    // Deux adaptateurs pour un même nom feraient dépendre le comportement de
    // l'ordre du tableau, et personne ne devinerait lequel répond.
    assert.throws(() => registre([fausse("telegram"), fausse("telegram")]), /Deux plateformes/u);
  });

  it("une plateforme inconnue s'EXPLIQUE au lieu de disparaître", () => {
    // A7 : un événement venu d'une plateforme non enregistrée est un fait
    // qu'on doit pouvoir lire dans un journal, pas une branche morte.
    const trouve = plateformeDe(registre([fausse("telegram")]), "signal");
    assert.property(trouve, "manque");
    if ("manque" in trouve) {
      assert.include(trouve.manque, "signal");
      assert.include(trouve.manque, "telegram");
    }
  });

  it("un registre VIDE le dit autrement — c'est un autre problème", () => {
    // « aucune plateforme enregistrée » veut dire « la passerelle est
    // branchée sans adaptateur » : ce n'est pas une faute de frappe.
    const trouve = plateformeDe(registre([]), "telegram");
    if ("manque" in trouve) assert.include(trouve.manque, "sans adaptateur");
  });
});

it.layer(NodeServices.layer, { excludeTestServices: true })("le cœur reste neutre", (it) => {
  it.effect("aucun module de passerelle ne nomme une plateforme en dur", () =>
    Effect.gen(function* () {
      // C'est TOUT l'objet du n°41 : ajouter Discord après Telegram doit être
      // un fichier de plus et zéro ligne modifiée. Un `if (plateforme ===
      // "discord")` dans le cœur ferait échouer le contrat — et il échouerait
      // en SILENCE, parce que ça marcherait quand même.
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dossier = path.join(racineDesSources(), "passerelle");
      const entrees = yield* fileSystem.readDirectory(dossier).pipe(Effect.orDie);
      assert.isAbove(entrees.length, 3, "dossier introuvable : le chemin a bougé");

      const fautifs: string[] = [];
      for (const entree of entrees) {
        if (!entree.endsWith(".ts") || entree.endsWith(".test.ts")) continue;
        const source = yield* fileSystem
          .readFileString(path.join(dossier, entree))
          .pipe(Effect.orElseSucceed(() => ""));
        // Le code, pas les commentaires : nommer Telegram pour expliquer une
        // limite mesurée est exactement ce qu'on veut lire.
        const code = source
          .replace(/\/\*[\s\S]*?\*\//gu, "")
          .split("\n")
          .filter((ligne) => !ligne.trimStart().startsWith("//"))
          .join("\n");
        if (/===\s*["'](?:telegram|discord|slack|whatsapp|signal)["']/iu.test(code)) {
          fautifs.push(entree);
        }
      }

      assert.deepEqual(
        fautifs,
        [],
        `Ces modules comparent un nom de plateforme en dur : ${fautifs.join(", ")}. ` +
          "Le cœur doit passer par le registre — sinon la quatrième plateforme coûte plus que la deuxième.",
      );
    }),
  );
});
