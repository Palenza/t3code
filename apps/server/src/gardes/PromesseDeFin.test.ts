// @effect-diagnostics nodeBuiltinImport:off - Le garde de câblage LIT la source de l'adaptateur : disque brut, pas de couche Effect.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { assert, describe, it } from "vite-plus/test";

import { finEnPromesse, raisonDuRefus } from "./PromesseDeFin.ts";

describe("annoncer n'est pas faire", () => {
  it("attrape les fins en promesse, FR comme EN", () => {
    const promesses = [
      "Tout est vert. J'enchaîne sur la suite.",
      "Le module est posé. Je vais maintenant écrire les tests.",
      "C'est compris. Je m'y mets.",
      "Voilà le plan.\n\nProchaine étape : le câblage.",
      "The module is ready. I'll now wire the adapter.",
      "Tests pass. Next, I'll open the PR.",
      "Let me now update the docs.",
    ];
    for (const texte of promesses) {
      assert.notStrictEqual(finEnPromesse(texte), null, texte);
    }
  });

  it("laisse passer le travail FAIT — le cas normal doit rester silencieux", () => {
    const sains = [
      "Livré : la rotation est visible, 12 tests verts, PR ouverte.",
      "J'ai corrigé le bug et rejoué la suite : 2 763 verts.",
      "Le déploiement est parti. La CI a confirmé le vert à 14 h 02.",
      // Le futur au MILIEU, suivi du travail : pas une fin en promesse.
      "Je vais maintenant détailler : d'abord X, ensuite Y. Voilà le détail complet de X et Y, terminé et vérifié.",
      "",
      "   ",
    ];
    for (const texte of sains) {
      assert.strictEqual(finEnPromesse(texte), null, texte);
    }
  });

  it("se tait TOUJOURS devant une question — rendre la main pour demander est légitime", () => {
    const questions = [
      "Je peux enchaîner sur le levier 2 — tu préfères ça ou le levier 3 ?",
      "I'll now need your decision: merge or wait?",
      "Prochaine étape : le câblage. On y va ?",
      "Je m'y mets ?",
    ];
    for (const texte of questions) {
      assert.strictEqual(finEnPromesse(texte), null, texte);
    }
  });

  it("ne juge que la FIN, pas une promesse enterrée sous trois paragraphes", () => {
    const texte = `Je vais maintenant tout refactorer.\n\n${"Fait. ".repeat(80)}Terminé et vérifié.`;
    assert.strictEqual(finEnPromesse(texte), null);
  });

  it("le refus cite la promesse et donne les deux issues (A7)", () => {
    const raison = raisonDuRefus("j'enchaîne");
    assert.ok(raison.includes("j'enchaîne"));
    assert.ok(raison.includes("FAIS maintenant"));
    assert.ok(raison.includes("question"));
  });
});

describe("le câblage, qui doit survivre aux fusions de l'amont", () => {
  const RACINE = NodePath.resolve(
    NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
    "../../../..",
  );

  it("l'adaptateur Claude porte le hook Stop et ses trois garde-fous", () => {
    const source = NodeFS.readFileSync(
      NodePath.join(RACINE, "apps/server/src/provider/Layers/ClaudeAdapter.ts"),
      "utf8",
    );
    assert.ok(/\bfinEnPromesse\(/u.test(source), "finEnPromesse n'est plus appelé");
    assert.ok(source.includes("Stop: ["), "le hook Stop a disparu");
    // Les garde-fous anti-boucle et anti-faux-positif sont la moitié de la
    // valeur : sans eux, le garde brûle des tours de quota.
    assert.ok(source.includes("stop_hook_active"), "le garde-fou anti-boucle a disparu");
    assert.ok(source.includes("background_tasks"), "le garde-fou travail-de-fond a disparu");
  });
});
