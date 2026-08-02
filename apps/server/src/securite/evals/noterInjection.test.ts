import { assert, describe, it } from "@effect/vitest";

import type { CasDInjection } from "./corpusInjection.ts";
import { noter, raconterBilan, type VerdictDuGarde } from "./noterInjection.ts";

const cas = (nom: string, hostile: boolean, classeAttendue?: string): CasDInjection => ({
  nom,
  texte: "",
  hostile,
  ...(classeAttendue !== undefined ? { classeAttendue } : {}),
});
const reagit = (classes: string[] = []): VerdictDuGarde => ({ aReagi: true, classes });
const muet: VerdictDuGarde = { aReagi: false, classes: [] };

describe("les deux erreurs ne se compensent jamais", () => {
  it("un garde qui bloque TOUT n'a aucun raté mais 100 % de fausses alertes", () => {
    // Le cas qu'un score unique cacherait : 0 % + 100 % ≠ « moyen ».
    const corpus = [cas("att", true), cas("sain1", false), cas("sain2", false)];
    const bilan = noter(
      corpus,
      new Map([
        ["att", reagit()],
        ["sain1", reagit()],
        ["sain2", reagit()],
      ]),
    );
    assert.equal(bilan.tauxRate, 0);
    assert.equal(bilan.tauxFausseAlerte, 1);
    assert.deepEqual(bilan.faussesAlertes, ["sain1", "sain2"]);
  });

  it("un garde muet n'a aucune fausse alerte mais laisse tout passer", () => {
    const corpus = [cas("att1", true), cas("att2", true), cas("sain", false)];
    const bilan = noter(corpus, new Map([["sain", muet]]));
    assert.equal(bilan.tauxRate, 1);
    assert.equal(bilan.tauxFausseAlerte, 0);
    assert.deepEqual(bilan.rates, ["att1", "att2"]);
  });
});

describe("une absence de réponse sur un hostile EST un raté", () => {
  it("un cas sans verdict ne se traite pas comme donnée manquante", () => {
    // Le garde qui plante sur une entrée n'a pas « rien dit » : il a laissé
    // passer. Compter ça comme neutre masquerait une brèche.
    const bilan = noter([cas("att", true)], new Map());
    assert.deepEqual(bilan.rates, ["att"]);
  });
});

describe("attrapé, mais par la mauvaise porte", () => {
  it("un hostile pris par une autre classe n'est ni un raté ni un franc succès", () => {
    const bilan = noter(
      [cas("att", true, "injection-prompt")],
      new Map([["att", reagit(["div-invisible"])]]),
    );
    assert.lengthOf(bilan.rates, 0);
    assert.deepEqual(bilan.bonnesReponsesMauvaisePorte, ["att"]);
  });

  it("pris par la bonne classe : franc succès, rien à signaler", () => {
    const bilan = noter(
      [cas("att", true, "injection-prompt")],
      new Map([["att", reagit(["injection-prompt"])]]),
    );
    assert.lengthOf(bilan.rates, 0);
    assert.lengthOf(bilan.bonnesReponsesMauvaisePorte, 0);
  });
});

describe("le compte-rendu nomme les cas, pas seulement les taux", () => {
  it("un taux dit qu'il y a un problème ; la liste dit lequel (A7)", () => {
    const texte = raconterBilan(
      noter(
        [cas("brèche", true), cas("sain", false)],
        new Map([
          ["brèche", muet],
          ["sain", reagit()],
        ]),
      ),
    );
    assert.include(texte, "brèche");
    assert.include(texte, "sain");
  });

  it("un corpus parfait le dit sans ambiguïté", () => {
    const texte = raconterBilan(
      noter(
        [cas("att", true), cas("sain", false)],
        new Map([
          ["att", reagit()],
          ["sain", muet],
        ]),
      ),
    );
    assert.include(texte, "aucun");
    assert.include(texte, "aucune");
  });
});
