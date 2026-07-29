import type { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { assert, beforeEach, describe, it } from "vite-plus/test";

import {
  dejaTentes,
  MAX_BASCULES_PAR_TOUR,
  noterBascule,
  oublierFil,
  peutEncoreBasculer,
  reclamerMort,
  viderJournal,
} from "./relaisJournal.ts";

const fil = "fil-1" as ThreadId;
const compte = (valeur: string) => valeur as ProviderInstanceId;

describe("journal des relais", () => {
  beforeEach(viderJournal);

  it("deux surfaces annoncent la MÊME mort : une seule la traite", () => {
    // Sans ça, l'erreur de runtime ET le tour marqué échoué déclencheraient
    // chacun un rejeu : le même message partirait deux fois, sur deux
    // comptes, et l'humain verrait deux réponses à une seule question.
    assert.strictEqual(reclamerMort(fil, "tour-42"), true);
    assert.strictEqual(reclamerMort(fil, "tour-42"), false);
    assert.strictEqual(reclamerMort(fil, "tour-42"), false);
  });

  it("deux tours différents sont deux morts distinctes", () => {
    assert.strictEqual(reclamerMort(fil, "tour-1"), true);
    assert.strictEqual(reclamerMort(fil, "tour-2"), true);
  });

  it("une mort sans tour identifié ne condamne pas le fil au silence", () => {
    // On ne peut pas distinguer deux morts successives sans identifiant :
    // marquer définitivement bloquerait toute mort ultérieure du fil.
    assert.strictEqual(reclamerMort(fil, undefined), true);
    assert.strictEqual(reclamerMort(fil, undefined), true);
  });

  it("une bascule marque les DEUX comptes comme tentés", () => {
    noterBascule(fil, compte("A"), compte("B"));

    const tentes = dejaTentes(fil);
    assert.ok(tentes.has(compte("A")), "le compte mort ne doit pas être repris");
    assert.ok(tentes.has(compte("B")), "le compte visé compte comme essayé");
  });

  it("un fil ne peut pas rebondir indéfiniment", () => {
    // Au-delà de trois essais ce n'est plus un problème de compte : c'est la
    // demande qui échoue, et la relancer brûlerait du quota partout.
    for (let index = 0; index < MAX_BASCULES_PAR_TOUR; index += 1) {
      assert.strictEqual(peutEncoreBasculer(fil), true, `bascule ${index + 1}`);
      noterBascule(fil, compte(`c${index}`), compte(`c${index + 1}`));
    }
    assert.strictEqual(peutEncoreBasculer(fil), false);
  });

  it("oublier le fil rouvre les bascules", () => {
    // Sinon les comptes tentés hier interdiraient les bascules d'aujourd'hui.
    for (let index = 0; index < MAX_BASCULES_PAR_TOUR; index += 1) {
      noterBascule(fil, compte(`c${index}`), compte(`c${index + 1}`));
    }
    assert.strictEqual(peutEncoreBasculer(fil), false);

    oublierFil(fil);

    assert.strictEqual(peutEncoreBasculer(fil), true);
    assert.strictEqual(dejaTentes(fil).size, 0);
  });

  it("deux fils ne se gênent pas", () => {
    const autre = "fil-2" as ThreadId;
    noterBascule(fil, compte("A"), compte("B"));

    assert.strictEqual(dejaTentes(autre).size, 0);
    assert.strictEqual(peutEncoreBasculer(autre), true);
  });
});
