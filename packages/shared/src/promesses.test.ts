import { assert, describe, it } from "vite-plus/test";

import { extrairePromesses, promesseTenue } from "./promesses.ts";

describe("extraction des promesses", () => {
  it("attrape les phrases RÉELLES qui ont été écrites sans être suivies", () => {
    // Les quatre fins de réponse de la session du 29/07, mot pour mot.
    const vraies = [
      "Je passe à Obsidian.",
      "J'attaque le relais.",
      "Le pool, maintenant. Je code, je ne l'annonce plus.",
      "Reste à brancher le socle sur l'orchestration pour que la bascule soit réelle. J'enchaîne.",
    ];
    for (const reponse of vraies) {
      assert.ok(
        extrairePromesses(reponse).length > 0,
        `non détectée : « ${reponse} »`,
      );
    }
  });

  it("reconnaît le futur proche et le futur simple", () => {
    assert.ok(extrairePromesses("Je vais brancher le pool ce soir.").length > 0);
    assert.ok(extrairePromesses("Je corrigerai le contraste ensuite.").length > 0);
  });

  it("garde la phrase telle quelle, sans la reformuler", () => {
    const [promesse] = extrairePromesses("J'attaque le relais.");
    assert.strictEqual(promesse?.phrase, "J'attaque le relais.");
    assert.strictEqual(promesse?.action, "attaque");
  });

  it("une NÉGATION n'est pas une promesse", () => {
    // « je ne vais pas construire » compterait sinon comme une promesse de
    // construire — l'exact contraire de ce qui a été dit.
    for (const reponse of [
      "Je ne vais pas construire la mémoire, on adopte claude-mem.",
      "Je ne code pas ça aujourd'hui.",
    ]) {
      assert.deepStrictEqual(extrairePromesses(reponse), [], reponse);
    }
  });

  it("« au lieu de » et « plutôt que de » n'engagent à rien", () => {
    assert.deepStrictEqual(
      extrairePromesses("Au lieu de construire la mémoire, on l'adopte."),
      [],
    );
  });

  it("une condition n'est pas un engagement", () => {
    assert.deepStrictEqual(
      extrairePromesses("Si tu veux, je peux brancher la fenêtre détachée."),
      [],
    );
  });

  it("le code ne promet rien", () => {
    // « je vais » dans un commentaire ou une chaîne produirait une promesse
    // fantôme que personne n'a faite.
    const reponse = [
      "Voici le module :",
      "```ts",
      '// je vais chercher les candidats',
      'const message = "je vais tout casser";',
      "```",
      "C'est fini.",
    ].join("\n");
    assert.deepStrictEqual(extrairePromesses(reponse), []);
  });

  it("une même phrase ne produit pas deux fois la même promesse", () => {
    const promesses = extrairePromesses("J'attaque le relais. J'attaque le relais.");
    assert.strictEqual(promesses.length, 1);
  });

  it("plusieurs promesses distinctes dans une réponse sont toutes vues", () => {
    const promesses = extrairePromesses(
      "Je branche le pool. Ensuite je vais tester le circuit. Je corrigerai le contraste après.",
    );
    assert.ok(promesses.length >= 3, `seulement ${promesses.length}`);
  });
});

describe("promesse tenue", () => {
  it("une promesse suivie du travail correspondant est close", () => {
    const [promesse] = extrairePromesses("Je branche le pool.");
    assert.ok(promesse);
    assert.strictEqual(
      promesseTenue(promesse, ["feat(pool): le relais est BRANCHÉ"]),
      true,
    );
  });

  it("une promesse sans trace du travail reste ouverte", () => {
    const [promesse] = extrairePromesses("J'attaque le relais.");
    assert.ok(promesse);
    assert.strictEqual(
      promesseTenue(promesse, ["docs: mise à jour du README", "chore: nettoyage"]),
      false,
    );
  });
});
