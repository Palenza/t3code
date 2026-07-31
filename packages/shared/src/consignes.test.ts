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

  it("REJETTE les constats en « ne … pas » — les 4 fausses du 31/07", () => {
    // Lues telles quelles sur le disque : elles étaient parties dans le
    // CLAUDE.md des trois comptes, et réinjectées comme interdits éternels
    // dans chaque session de chaque projet. Trois rapports de bug sur une
    // carte de couleurs, plus une plainte de lecture.
    const constats = [
      "on a un problème dans la carte de couleurs tu peux voir que les points ne sont pas à distance égale alors qu'ils doivent toujours le rester.",
      "Également je peux je ne peux pas rajouter trois points.",
      "Ça ne rajoute pas un peu de la granularité.",
      "Je ne peux pas lire proprement.",
    ];
    for (const message of constats) {
      const retenues = extraireConsignes(message);
      const interdits = retenues.filter((consigne) => consigne.nature === "interdit");
      assert.strictEqual(
        interdits.length,
        0,
        `constat pris pour un interdit : « ${message} » → ${JSON.stringify(interdits)}`,
      );
    }
  });

  it("garde les interdictions ADRESSÉES, elles", () => {
    // La contrepartie : le correctif ne doit pas désarmer les vraies.
    const vraies = [
      "Ne me demande pas de copier la console.",
      "Tu ne touches pas à la prod.",
      "Ne me vouvoie plus jamais.",
      "On ne passe jamais par d'autres serveurs.",
      "Il ne faut pas déployer sans mon accord.",
      "Je ne veux pas de commit automatique.",
      "Arrête de créer des DMG à tout bout de champ.",
    ];
    for (const message of vraies) {
      const interdits = extraireConsignes(message).filter((c) => c.nature === "interdit");
      assert.ok(interdits.length > 0, `interdiction perdue : « ${message} »`);
    }
  });

  it("« tu » ailleurs dans la phrase ne suffit pas à en faire une règle", () => {
    // Le piège exact de la phrase du 31/07 : elle contient « tu peux voir »,
    // donc elle a l'air adressée — mais la négation, elle, porte sur « les
    // points ». L'adresse doit être LOCALE à la négation.
    const interdits = extraireConsignes(
      "tu peux voir que les points ne sont pas à distance égale.",
    ).filter((c) => c.nature === "interdit");
    assert.strictEqual(interdits.length, 0);
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
    assert.deepStrictEqual(extraireConsignes("Le pool est branché et les tests passent."), []);
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
    const message = ["Regarde :", "```ts", "// ne jamais faire ça", "```", "C'est tout."].join(
      "\n",
    );
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

  it("dit d'OÙ il vient et ce qu'il ne dépasse pas", () => {
    // Ce bloc est relu par CHAQUE session de CHAQUE compte, donc aussi par
    // celles qui travaillent sur un autre projet que celui où la phrase a été
    // dite. Il revendiquait la primauté sans nommer sa provenance : une règle
    // lâchée en déboguant le cockpit s'annonçait gagnante face aux règles
    // écrites et versionnées d'un projet qui n'a rien à voir. C'est la seule
    // collision entre les deux mondes, et elle se répare par une phrase.
    const texte = memoireAReinjecter([
      { phrase: "Ne déploie jamais le vendredi.", nature: "interdit" },
    ]);
    assert.ok(texte.includes("TOUS PROJETS CONFONDUS"), "la portée doit être dite");
    assert.ok(
      /ne priment PAS sur les règles écrites/u.test(texte),
      "la limite face aux règles du projet doit être dite",
    );
    assert.ok(
      /DIS-LE au\s+lieu de trancher en silence/u.test(texte),
      "une contradiction doit se dire, jamais se trancher en silence",
    );
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

describe("ce qui est COLLÉ n'est pas ce qui est demandé", () => {
  // Fixtures RÉELLES : ces cinq phrases sont entrées dans les consignes
  // permanentes de TOUS les projets le 31/07, parce que l'humain avait collé
  // une conversation entière dans son message. Le mineur tourne sur le
  // message envoyé — il ne distinguait pas ce qu'on DIT de ce qu'on COLLE.
  const collees = [
    "Les règles critiques (« ne jamais pousser sur main », « toujours lancer make lint ») vont dans le CLAUDE.md racine ; les guides détaillés vont en skills.",
    "Donc au lieu de lutter contre la compaction, exploitez-la : ce qui compte ne doit jamais vivre uniquement dans la conversation.",
    "L'état ne dépend plus du résumé.",
    "« ne jamais remettre une arène à zéro trop tôt » = ne pas libérer la région mémoire avant la fin du cycle de rendu.",
    "À utiliser systématiquement pour : exploration de codebase, lecture de logs, recherche documentaire, revue large.",
  ];

  for (const phrase of collees) {
    it(`ne retient pas : ${phrase.slice(0, 46)}…`, () => {
      assert.deepEqual(extraireConsignes(phrase), []);
    });
  }

  it("laisse passer les VRAIES consignes de l'humain", () => {
    // Les deux seules des vingt qui méritaient d'être permanentes.
    assert.equal(
      extraireConsignes("fait tout , tu ne dois jamais tarreter sauf si tu as un doute").length,
      1,
    );
    assert.equal(extraireConsignes("Ça doit toujours se redémarrer là où tu as quitté.").length, 1);
  });

  it("garde la règle impersonnelle en « on », qui est bien sa voix", () => {
    assert.equal(extraireConsignes("On ne passe jamais par d'autres serveurs.").length, 1);
  });

  it("ne confond pas « assez » et « chez » avec du vouvoiement", () => {
    assert.equal(extraireConsignes("Tu ne dois jamais en mettre assez peu.").length, 1);
    assert.equal(
      extraireConsignes("Ne va jamais chez un autre fournisseur, tu perds tout.").length,
      1,
    );
  });
});
