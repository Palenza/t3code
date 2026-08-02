import { assert, describe, it } from "@effect/vitest";

import {
  bornesDeFil,
  expressionMatch,
  fenetreAutour,
  meilleurParFil,
  modeDeRappel,
  bornerCharge,
  tronquerMessage,
  PENALITE_FIL_ARCHIVE,
  PLAFOND_ANCRE,
  PLAFOND_BORNE,
  PLAFOND_CHARGE,
  PLAFOND_VOISIN,
  type MessageDeFil,
  type TrouvailleBrute,
} from "./RappelRequete.ts";

const msg = (id: string, texte = "x"): MessageDeFil => ({
  messageId: id,
  role: "user",
  texte,
  creeA: "2026-07-31T00:00:00.000Z",
});

const trouvaille = (
  messageId: string,
  filId: string,
  score: number,
  filArchive = false,
): TrouvailleBrute => ({ messageId, filId, score, filArchive });

describe("modeDeRappel", () => {
  it("déduit le mode des arguments, sans paramètre de mode", () => {
    assert.equal(modeDeRappel({ question: "le curateur" }), "decouverte");
    assert.equal(modeDeRappel({ filId: "f1", autourDe: "m9" }), "defilement");
    assert.equal(modeDeRappel({}), "parcours");
  });

  it("le défilement gagne sur la question quand les deux sont là", () => {
    // Un appelant qui garde sa question en mémoire pendant qu'il défile
    // relancerait une recherche complète à chaque pas.
    assert.equal(
      modeDeRappel({ question: "le curateur", filId: "f1", autourDe: "m9" }),
      "defilement",
    );
  });

  it("ignore le blanc plutôt que de le prendre pour une intention", () => {
    assert.equal(modeDeRappel({ question: "   " }), "parcours");
    assert.equal(modeDeRappel({ filId: "f1", autourDe: "  " }), "parcours");
  });
});

describe("expressionMatch", () => {
  it("cite chaque mot : FTS5 les combine en ET implicite", () => {
    assert.equal(expressionMatch("curateur archive"), '"curateur" "archive"');
  });

  it("désarme ce qui ferait PARLER FTS5 au lieu de chercher", () => {
    // Chacune de ces entrées LÈVE une erreur de syntaxe si on l'injecte
    // telle quelle — la recherche a alors l'air cassée alors qu'elle a
    // seulement été mal citée.
    assert.equal(expressionMatch(`c'est quoi ce délire ?`), '"c" "est" "quoi" "ce" "délire"');
    assert.equal(expressionMatch(`il a dit "non"`), '"il" "a" "dit" "non"');
    assert.equal(expressionMatch("src/api OR NEAR(x)"), '"src" "api" "OR" "NEAR" "x"');
    assert.equal(expressionMatch("--flag -exclu"), '"flag" "exclu"');
    assert.equal(expressionMatch("prefixe*"), '"prefixe"');
  });

  it("rend null quand il ne reste rien de cherchable", () => {
    assert.equal(expressionMatch("???"), null);
    assert.equal(expressionMatch("   "), null);
    assert.equal(expressionMatch("--- *** ()"), null);
  });

  it("garde les accents et les chiffres — c'est du français", () => {
    assert.equal(expressionMatch("déployé 3 fois"), '"déployé" "3" "fois"');
  });
});

describe("meilleurParFil", () => {
  it("garde UN résultat par fil : un fil bavard ne masque plus les autres", () => {
    const rendu = meilleurParFil(
      [
        trouvaille("m1", "fil-A", -5),
        trouvaille("m2", "fil-A", -9),
        trouvaille("m3", "fil-A", -7),
        trouvaille("m4", "fil-B", -6),
      ],
      10,
    );
    assert.deepEqual(
      rendu.map((t) => t.messageId),
      ["m2", "m4"],
    );
  });

  it("rétrograde le fil archivé sans jamais l'exclure", () => {
    // La leçon d'Hermès (#19434) : exclure crée une cécité de rappel.
    // Un fil rangé reste atteignable quand il est la seule réponse.
    const seul = meilleurParFil([trouvaille("m1", "fil-A", -3, true)], 10);
    assert.deepEqual(
      seul.map((t) => t.messageId),
      ["m1"],
    );

    // Mais il passe derrière un fil vivant de score comparable.
    const melange = meilleurParFil(
      [trouvaille("m1", "fil-archive", -8, true), trouvaille("m2", "fil-vivant", -7)],
      10,
    );
    assert.deepEqual(
      melange.map((t) => t.filId),
      ["fil-vivant", "fil-archive"],
    );
  });

  it("ne bascule QUE si l'écart dépasse la pénalité", () => {
    // -12 archivé devient -10 ; il bat toujours -9.
    const rendu = meilleurParFil(
      [trouvaille("m1", "archive", -12, true), trouvaille("m2", "vivant", -9)],
      10,
    );
    assert.equal(rendu[0]?.filId, "archive");
    assert.equal(PENALITE_FIL_ARCHIVE, 2);
  });

  it("respecte le plafond et supporte un plafond absurde", () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => trouvaille(`m${i}`, `fil-${i}`, -i));
    assert.equal(meilleurParFil(beaucoup, 3).length, 3);
    assert.equal(meilleurParFil(beaucoup, 0).length, 0);
    assert.equal(meilleurParFil(beaucoup, -5).length, 0);
  });
});

describe("fenetreAutour", () => {
  const fil = Array.from({ length: 20 }, (_, i) => msg(`m${i}`));

  it("rend ±rayon autour de l'ancre", () => {
    const f = fenetreAutour(fil, "m10", 2);
    assert.deepEqual(
      f.map((m) => m.messageId),
      ["m8", "m9", "m10", "m11", "m12"],
    );
  });

  it("se borne aux extrémités sans jamais déborder", () => {
    assert.deepEqual(
      fenetreAutour(fil, "m0", 3).map((m) => m.messageId),
      ["m0", "m1", "m2", "m3"],
    );
    assert.deepEqual(
      fenetreAutour(fil, "m19", 3).map((m) => m.messageId),
      ["m16", "m17", "m18", "m19"],
    );
  });

  it("rend vide sur une ancre inconnue plutôt que de deviner", () => {
    assert.deepEqual(fenetreAutour(fil, "fantôme", 5), []);
  });
});

describe("bornesDeFil", () => {
  it("rend le début et la fin — l'orientation, pas juste l'extrait", () => {
    const fil = Array.from({ length: 30 }, (_, i) => msg(`m${i}`));
    const b = bornesDeFil(fil, 3);
    assert.deepEqual(
      b.debut.map((m) => m.messageId),
      ["m0", "m1", "m2"],
    );
    assert.deepEqual(
      b.fin.map((m) => m.messageId),
      ["m27", "m28", "m29"],
    );
  });

  it("rend le fil ENTIER quand il est trop court pour deux bouts distincts", () => {
    // Sinon on afficherait deux fois les mêmes messages.
    const court = [msg("a"), msg("b"), msg("c"), msg("d")];
    const b = bornesDeFil(court, 3);
    assert.deepEqual(
      b.debut.map((m) => m.messageId),
      ["a", "b", "c", "d"],
    );
    assert.deepEqual(b.fin, []);
  });

  it("supporte zéro et le vide", () => {
    assert.deepEqual(bornesDeFil([msg("a")], 0), { debut: [], fin: [] });
    assert.deepEqual(bornesDeFil([], 3), { debut: [], fin: [] });
  });
});

describe("bornes de charge", () => {
  it("laisse tranquille un message ordinaire", () => {
    // p50 = 180 caractères sur la base réelle : le sain ne doit jamais sentir
    // que la limite existe.
    const ordinaire = msg("m1", "x".repeat(180));
    assert.equal(tronquerMessage(ordinaire, PLAFOND_ANCRE), ordinaire);
    assert.equal(
      tronquerMessage(msg("m2", "x".repeat(PLAFOND_ANCRE)), PLAFOND_ANCRE).texte.length,
      PLAFOND_ANCRE,
    );
  });

  it("coupe l'énorme en DISANT ce qui a été retiré", () => {
    // Le vrai cas : un message de 416 190 caractères existe dans la base.
    const enorme = msg("m1", "x".repeat(20_000));
    const coupe = tronquerMessage(enorme, PLAFOND_ANCRE);
    assert.isTrue(coupe.texte.startsWith("x".repeat(100)));
    assert.include(coupe.texte, "12000 caractères de plus");
    assert.include(coupe.texte, `plafond ${PLAFOND_ANCRE}`);
  });

  it("garde TOUJOURS le premier, même s'il dépasse à lui seul", () => {
    // Rendre zéro parce que le meilleur résultat est trop gros serait la pire
    // réponse : l'agent conclurait « rien trouvé » alors qu'on a trouvé.
    const borne = bornerCharge([500, 10, 10], (n) => n, 100);
    assert.deepEqual(borne.retenus, [500]);
    assert.equal(borne.ecartes, 2);
  });

  it("compte ce qu'il écarte plutôt que de le taire", () => {
    const borne = bornerCharge([30, 30, 30, 30], (n) => n, 70);
    assert.deepEqual(borne.retenus, [30, 30]);
    assert.equal(borne.ecartes, 2);
  });

  it("ne coupe rien quand tout tient", () => {
    const borne = bornerCharge([10, 10, 10], (n) => n, 1000);
    assert.deepEqual(borne.retenus, [10, 10, 10]);
    assert.equal(borne.ecartes, 0);
  });

  it("supporte le vide", () => {
    const borne = bornerCharge([], (n: number) => n, 100);
    assert.deepEqual(borne.retenus, []);
    assert.equal(borne.ecartes, 0);
  });

  it("le plafond par message reste au-dessus du p99 mesuré", () => {
    // p99 = 4 568 caractères sur 3 851 messages réels. Si un jour le plafond
    // descend sous cette valeur, il mordrait des messages SAINS — et c'est
    // alors la limite qui aurait tort.
    assert.isAtLeast(PLAFOND_ANCRE, 4_568);
  });
});

describe("les trois tiers de troncature", () => {
  it("l'ancre est plus généreuse que le voisin, le voisin que la borne", () => {
    // L'ordre EST la conception : la preuve arrive entière, le contexte
    // écourté, l'orientation courte. Si quelqu'un les égalise un jour, il
    // aura effacé la distinction sans le vouloir — ce test l'arrêtera.
    assert.isAbove(PLAFOND_ANCRE, PLAFOND_VOISIN);
    assert.isAbove(PLAFOND_VOISIN, PLAFOND_BORNE);
  });

  it("chaque plafond reste calé sur un percentile mesuré", () => {
    // p99 = 4 568 : l'ancre ne doit mordre que l'énorme.
    assert.isAtLeast(PLAFOND_ANCRE, 4_568);
    // p90 = 1 210 : neuf voisins sur dix doivent passer entiers.
    assert.isAtLeast(PLAFOND_VOISIN, 1_200);
  });

  it("le fil-piège global reste au-dessus du pire cas RÉEL mesuré", () => {
    // 73 960 caractères, mesurés en rejouant les vraies questions du
    // fondateur. Si la limite descend sous cette valeur, elle mordra des
    // recherches saines — et c'est alors la limite qui aura tort.
    assert.isAbove(PLAFOND_CHARGE, 73_960);
  });
});
