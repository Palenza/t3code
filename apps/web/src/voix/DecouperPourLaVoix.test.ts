import { assert, describe, it } from "@effect/vitest";

import { decouper, pourLOreille, vider } from "./DecouperPourLaVoix.ts";

describe("rendre ce qui est prêt, et RIEN de plus", () => {
  it("une phrase complète part, le début de la suivante attend", () => {
    const { prets, reste } = decouper("Le test passe. Je continue sur");
    assert.deepEqual(prets, ["Le test passe."]);
    assert.equal(reste.trim(), "Je continue sur");
  });

  it("un fragment sans ponctuation ne part PAS", () => {
    // Parler à chaque fragment donnerait un hachis : le moteur redémarre sa
    // prosodie à chaque appel.
    const { prets, reste } = decouper("Je suis en train de");
    assert.deepEqual(prets, []);
    assert.equal(reste, "Je suis en train de");
  });

  it("plusieurs phrases partent ensemble, dans l'ordre", () => {
    const { prets } = decouper("D'abord ceci. Ensuite cela ! Et enfin ?");
    assert.deepEqual(prets, ["D'abord ceci.", "Ensuite cela !", "Et enfin ?"]);
  });
});

describe("les points qui ne terminent rien", () => {
  it("une abréviation ne coupe pas la phrase", () => {
    const { prets } = decouper("J'ai vu M. Dupont hier soir. Il allait bien.");
    assert.deepEqual(prets, ["J'ai vu M. Dupont hier soir.", "Il allait bien."]);
  });

  it("« etc. » non plus", () => {
    const { prets } = decouper("Des tests, du lint, etc. puis on commite. Voilà.");
    assert.equal(prets[0], "Des tests, du lint, etc. puis on commite.");
  });

  it("un nombre décimal reste entier", () => {
    const { prets } = decouper("La version 0.0.51 est sortie. Enfin.");
    assert.deepEqual(prets, ["La version 0.0.51 est sortie.", "Enfin."]);
  });

  it("un nom de fichier ne se fait pas couper en deux", () => {
    const { prets } = decouper("Regarde config.ts pour comprendre. C'est là.");
    assert.deepEqual(prets, ["Regarde config.ts pour comprendre.", "C'est là."]);
  });
});

describe("ce qui se termine SANS ponctuation", () => {
  it("une ligne vide termine un paragraphe — un titre n'a pas de point", () => {
    // Sans ça, la voix resterait muette jusqu'au paragraphe suivant.
    const { prets } = decouper("## Ce qui reste\n\nTrois choses.");
    assert.equal(prets[0], "## Ce qui reste");
  });

  it("la fin du flux vaut une fin de phrase", () => {
    // C'est le seul moment où on est sûr qu'il n'y aura pas de suite.
    assert.deepEqual(vider("Un dernier mot sans point"), ["Un dernier mot sans point"]);
    assert.deepEqual(vider("   "), []);
  });
});

describe("ce qu'on ne prononce pas", () => {
  it("un bloc de code devient sa TAILLE", () => {
    // « accolade ouvrante retour chariot const espace » n'apprend rien à une
    // oreille ; « un bloc de trois lignes » si.
    const dit = pourLOreille(
      "Voici :\n```ts\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\nVoilà.",
    );
    assert.include(dit, "un bloc de 3 lignes");
    assert.notInclude(dit, "const");
  });

  it("un extrait d'une seule ligne se dit autrement", () => {
    const dit = pourLOreille("Lance ```npm test``` maintenant.");
    assert.include(dit, "un extrait de code");
  });

  it("une URL devient « un lien »", () => {
    const dit = pourLOreille("Va voir https://api.osv.dev/v1/query pour le détail.");
    assert.include(dit, "un lien");
    assert.notInclude(dit, "https");
  });

  it("le balisage markdown disparaît", () => {
    assert.equal(pourLOreille("**gras** et `code` et # titre"), "gras et code et titre");
  });
});

describe("bout à bout, comme le flux arrive vraiment", () => {
  it("des fragments successifs ne rendent jamais deux fois la même chose", () => {
    // C'est l'invariant qui compte : on recolle le reste au fragment suivant,
    // et une unité déjà dite ne doit jamais repartir.
    const fragments = ["Le premier test ", "passe. Le ", "second aussi. Et le troi", "sième."];
    let reste = "";
    const tout: string[] = [];
    for (const fragment of fragments) {
      const decoupe = decouper(reste + fragment);
      tout.push(...decoupe.prets);
      reste = decoupe.reste;
    }
    tout.push(...vider(reste));

    assert.deepEqual(tout, ["Le premier test passe.", "Le second aussi.", "Et le troisième."]);
  });
});
