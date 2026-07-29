import { assert, describe, it } from "vite-plus/test";

import { extraireConsignes, memoireAReinjecter } from "./consignes.ts";

describe("extraction des consignes durables", () => {
  it("retient les VRAIES consignes de la session du 29/07", () => {
    // Mot pour mot, ce qui a été dit — et qui aurait dû survivre à la
    // fermeture de la session.
    const vraies = [
      "Arrête de créer des DMG à tout bout de champ.",
      "Ne me vouvoie plus jamais.",
      "On ne passe jamais par d'autres serveurs, par d'autres API.",
      "Je veux que tu répliques ça à cent pour cent.",
      "Il faut absolument que le relais soit fait.",
    ];
    for (const message of vraies) {
      assert.ok(extraireConsignes(message).length > 0, `non retenue : « ${message} »`);
    }
  });

  it("classe les interdictions à part des obligations", () => {
    const [interdit] = extraireConsignes("Ne me vouvoie plus jamais.");
    assert.strictEqual(interdit?.nature, "interdit");

    const [impose] = extraireConsignes("Je veux que tu vérifies toujours avant d'affirmer.");
    assert.strictEqual(impose?.nature, "impose");
  });

  it("une demande PONCTUELLE n'entre pas en mémoire", () => {
    // « Il faut que tu corriges ce bouton » ne vaut que pour aujourd'hui ;
    // le retenir pour toujours polluerait la mémoire de tâches périmées.
    for (const message of [
      "Il faut que tu corriges ce bouton.",
      "Je veux que tu répares cette page d'abord.",
      "Maintenant, corrige le contraste.",
    ]) {
      assert.deepStrictEqual(extraireConsignes(message), [], message);
    }
  });

  it("une phrase sans marqueur n'est pas une consigne", () => {
    assert.deepStrictEqual(
      extraireConsignes("Le pool est branché et les tests passent."),
      [],
    );
  });

  it("le français parlé descriptif ne fabrique JAMAIS de règle — les pièges de l'audit", () => {
    // Chacune de ces phrases devenait une règle éternelle avant le
    // durcissement (prouvé par exécution, audit 29/07).
    for (const piege of [
      "Ça marche toujours pas.",
      "Le bug est toujours là après le déploiement.",
      "On n'a jamais testé sur Safari.",
      "Tu as toujours accès au serveur ?",
      "Le thème sombre est activé par défaut.",
      "Il n'y a jamais eu de problème avec Stripe.",
      "Mieux vaut tard que jamais pour le fix.",
    ]) {
      assert.deepStrictEqual(extraireConsignes(piege), [], piege);
    }
  });

  it("une interdiction directive avec un démonstratif reste retenue", () => {
    // « ce » ne doit pas désarmer un vrai interdit.
    const [c] = extraireConsignes("Ne touche plus jamais à ce dossier de production.");
    assert.strictEqual(c?.nature, "interdit");
  });

  it("le code ne pose pas de règle", () => {
    const message = ["Regarde :", "```ts", "// ne jamais faire ça", "```", "C'est tout."].join("\n");
    assert.deepStrictEqual(extraireConsignes(message), []);
  });

  it("un paragraphe entier n'est pas retenu tel quel", () => {
    // Une mémoire faite de pavés noie ce qui compte.
    const pave = `Il faut toujours ${"x".repeat(420)}.`;
    assert.deepStrictEqual(extraireConsignes(pave), []);
  });

  it("la même consigne répétée n'est retenue qu'une fois", () => {
    const consignes = extraireConsignes("Ne fais jamais ça. Ne fais jamais ça.");
    assert.strictEqual(consignes.length, 1);
  });
});

describe("mémoire réinjectée", () => {
  it("met les interdictions en tête", () => {
    // Une règle enfreinte fait des dégâts ; une règle non appliquée fait
    // perdre du temps. L'ordre encode cette différence.
    const texte = memoireAReinjecter([
      { phrase: "Vérifie toujours avant d'affirmer.", nature: "impose" },
      { phrase: "Ne construis jamais de DMG sans demande.", nature: "interdit" },
    ]);
    const rangInterdit = texte.indexOf("Ne construis jamais");
    const rangImpose = texte.indexOf("Vérifie toujours");
    assert.ok(rangInterdit < rangImpose, "l'interdiction doit passer devant");
  });

  it("plafonne — une mémoire sans fin coûte plus qu'elle ne rapporte", () => {
    const beaucoup = Array.from({ length: 60 }, (_, index) => ({
      phrase: `Ne fais jamais la chose numéro ${index}.`,
      nature: "interdit" as const,
    }));
    const lignes = memoireAReinjecter(beaucoup)
      .split("\n")
      .filter((ligne) => ligne.startsWith("- "));
    assert.strictEqual(lignes.length, 20);
  });

  it("rien à dire = rien du tout, pas un en-tête vide", () => {
    assert.strictEqual(memoireAReinjecter([]), "");
  });

  it("dit que ces règles priment sur les habitudes", () => {
    const texte = memoireAReinjecter([{ phrase: "Ne fais jamais ça.", nature: "interdit" }]);
    assert.match(texte, /priment/u);
  });
});
