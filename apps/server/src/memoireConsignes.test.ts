import { assert, describe, it } from "vite-plus/test";

import { fusionner } from "./memoireConsignes.ts";

const MEMOIRE = "# Ce qui vaut toujours\n\n- Ne construis jamais de DMG sans demande.";

describe("fusion de la mémoire dans le fichier de la CLI", () => {
  it("écrit notre bloc EN TÊTE d'un fichier existant", () => {
    // Ce que l'humain a interdit doit être lu avant les instructions de
    // projet, pas après.
    const resultat = fusionner("# Projet\n\nInstructions du dépôt.\n", MEMOIRE);
    assert.ok(resultat.indexOf("Ne construis jamais") < resultat.indexOf("Instructions du dépôt"));
  });

  it("remplace notre bloc au lieu d'en empiler un second", () => {
    const premier = fusionner("", MEMOIRE);
    const second = fusionner(premier, "# Ce qui vaut toujours\n\n- Nouvelle règle.");

    assert.ok(!second.includes("Ne construis jamais"), "l'ancien bloc doit disparaître");
    assert.ok(second.includes("Nouvelle règle"));
    // Un seul marqueur de début : sinon le fichier gonflerait à chaque session.
    assert.strictEqual(second.split("memoire-t3code:debut").length - 1, 1);
  });

  it("ne touche JAMAIS à ce que l'utilisateur a écrit à côté", () => {
    const sien = "# Mes règles à moi\n\n- Toujours utiliser pnpm.\n";
    const avec = fusionner(sien, MEMOIRE);
    const apres = fusionner(avec, "# Ce qui vaut toujours\n\n- Autre chose.");

    assert.ok(apres.includes("Toujours utiliser pnpm"), "le texte de l'utilisateur survit");
    assert.ok(apres.includes("Mes règles à moi"));
  });

  it("une mémoire vide RETIRE le bloc au lieu d'écrire un titre orphelin", () => {
    const avec = fusionner("# Projet\n", MEMOIRE);
    const sans = fusionner(avec, "");

    assert.ok(!sans.includes("memoire-t3code"));
    assert.ok(sans.includes("# Projet"));
  });

  it("une mémoire vide sur un fichier vierge n'écrit rien du tout", () => {
    assert.strictEqual(fusionner("", ""), "");
  });
});
