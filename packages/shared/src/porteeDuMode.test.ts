import { assert, describe, it } from "vite-plus/test";

import { compterLaPortee, decrirePortee } from "./porteeDuMode.ts";

/**
 * LE MENSONGE QU'ON REFERME — « tous restreints » alors que rien n'est écrit.
 *
 * Chaque cas ci-dessous a existé : le serveur ne pouvait pas distinguer un
 * compte restreint d'un compte dont l'écriture avait échoué, donc l'écran
 * annonçait la protection dans les deux cas.
 */
describe("la portée d'un mode ne peut plus sur-promettre", () => {
  it("dit « tous restreints » SEULEMENT quand tout est posé", () => {
    assert.strictEqual(
      decrirePortee({ comptes: 3, comptesTotal: 3, comptesSautes: 0, comptesEnEchec: 0 }),
      "3 comptes sur 3 — tous restreints.",
    );
  });

  it("ne dit JAMAIS « tous restreints » dès qu'un compte a échoué", () => {
    const phrase = decrirePortee({
      comptes: 2,
      comptesTotal: 3,
      comptesSautes: 0,
      comptesEnEchec: 1,
    });
    assert.notInclude(phrase, "tous restreints");
    // Le nombre en échec est DIT : sans lui, « 2 sur 3 » se lit « un compte
    // sans dossier », qui n'appelle aucune action.
    assert.include(phrase, "ÉCHEC sur 1");
    assert.include(phrase, "PAS été restreint");
  });

  it("distingue un compte SAUTÉ d'un compte en ÉCHEC dans la même phrase", () => {
    const phrase = decrirePortee({
      comptes: 1,
      comptesTotal: 3,
      comptesSautes: 1,
      comptesEnEchec: 1,
    });
    assert.include(phrase, "ÉCHEC sur 1");
    assert.include(phrase, "1 sans dossier propre");
  });

  it("dit les comptes sautés quand il n'y a aucun échec", () => {
    const phrase = decrirePortee({
      comptes: 1,
      comptesTotal: 3,
      comptesSautes: 2,
      comptesEnEchec: 0,
    });
    assert.include(phrase, "2 sans dossier propre");
    assert.notInclude(phrase, "ÉCHEC");
  });

  it("un mode sans effet le dit — un zéro ne ressemble pas à un succès", () => {
    assert.include(
      decrirePortee({ comptes: 0, comptesTotal: 2, comptesSautes: 2, comptesEnEchec: 0 }),
      "rien n'a été restreint",
    );
  });

  it("zéro posé mais des échecs n'est PAS « aucun dossier propre »", () => {
    // Le cas le plus traître : rien n'est écrit, mais la cause n'est pas
    // l'absence de dossier — c'est une panne. Les deux phrases mènent à des
    // gestes opposés (ne rien faire / réparer le disque).
    const phrase = decrirePortee({
      comptes: 0,
      comptesTotal: 2,
      comptesSautes: 0,
      comptesEnEchec: 2,
    });
    assert.notInclude(phrase, "rien n'a été restreint");
    assert.include(phrase, "ÉCHEC sur 2");
  });

  it("survit à un serveur qui n'envoie pas les nouveaux champs", () => {
    // Une version ancienne du serveur ne connaît pas `comptesEnEchec`. Le
    // repli doit rester HONNÊTE, pas planter et pas sur-promettre au-delà de
    // ce que l'ancien serveur savait dire.
    assert.strictEqual(
      decrirePortee({ comptes: 2, comptesTotal: 2 }),
      "2 comptes sur 2 — tous restreints.",
    );
    assert.include(decrirePortee({}), "rien n'a été restreint");
  });
});

/**
 * LE MAILLON DU MILIEU — celui qui était nu.
 *
 * La mutation l'a prouvé : supprimer le tri des issues côté serveur ne
 * rendait AUCUN test rouge. C'est pourtant exactement là que vivait le bug —
 * entre une fonction qui savait dire son échec et une phrase qui savait le
 * lire, un décompte qui ne regardait rien.
 */
describe("le décompte compte les ISSUES, jamais les appels", () => {
  it("trois succès font trois comptes restreints", () => {
    assert.deepStrictEqual(compterLaPortee(["applique", "applique", "applique"]), {
      comptes: 3,
      comptesTotal: 3,
      comptesSautes: 0,
      comptesEnEchec: 0,
    });
  });

  it("un settings.json abîmé N'EST PAS un compte restreint", () => {
    const portee = compterLaPortee(["applique", "settings-illisible"]);
    assert.strictEqual(portee.comptes, 1, "l'échec a été compté comme un succès");
    assert.strictEqual(portee.comptesEnEchec, 1);
  });

  it("un disque en lecture seule N'EST PAS un compte restreint", () => {
    const portee = compterLaPortee(["ecriture-refusee", "ecriture-refusee"]);
    assert.strictEqual(portee.comptes, 0);
    assert.strictEqual(portee.comptesEnEchec, 2);
    assert.strictEqual(portee.comptesSautes, 0, "un échec n'est pas un saut");
  });

  it("le total couvre TOUJOURS les trois issues, sans reste", () => {
    // Sans cet invariant, `comptesSautes` se calculait par soustraction et
    // absorbait silencieusement tout état qu'on aurait oublié d'ajouter.
    const portee = compterLaPortee([
      "applique",
      "saute",
      "settings-illisible",
      "ecriture-refusee",
      "saute",
    ]);
    assert.strictEqual(
      portee.comptes + portee.comptesSautes + portee.comptesEnEchec,
      portee.comptesTotal,
    );
    assert.deepStrictEqual(portee, {
      comptes: 1,
      comptesTotal: 5,
      comptesSautes: 2,
      comptesEnEchec: 2,
    });
  });

  it("aucun compte visé ne produit aucune promesse", () => {
    assert.strictEqual(
      decrirePortee(compterLaPortee([])),
      "Aucun compte n'a de dossier de configuration propre — rien n'a été restreint.",
    );
  });

  it("compter PUIS décrire ne peut plus sur-promettre — la chaîne entière", () => {
    // Le seul test qui traverse les deux moitiés. Chacune était juste
    // séparément ; c'est leur jointure qui mentait.
    const phrase = decrirePortee(compterLaPortee(["applique", "ecriture-refusee", "saute"]));
    assert.notInclude(phrase, "tous restreints");
    assert.include(phrase, "1 compte sur 3");
    assert.include(phrase, "ÉCHEC sur 1");
    assert.include(phrase, "1 sans dossier propre");
  });
});
