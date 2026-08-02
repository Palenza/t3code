import { assert, describe, it } from "@effect/vitest";

import { ASTUCES, ilResteAApprendre, quelleAstuce } from "./QuelleAstuce.ts";

const TOUTES = new Set(ASTUCES.map((astuce) => astuce.capacite));
const RIEN = new Set<string>();

describe("montrer ce qu'on n'a pas encore trouvé", () => {
  it("une capacité déjà utilisée n'est plus proposée", () => {
    // Les astuces sur ce qu'on fait déjà ne peuvent rien apprendre : elles
    // décrivent, elles n'enseignent pas.
    const dejaFait = new Set(["selecteur-de-projet"]);
    const astuce = quelleAstuce(dejaFait, RIEN);
    assert.notEqual(astuce?.capacite, "selecteur-de-projet");
  });

  it("quand tout a servi, on se TAIT", () => {
    // Une bannière qui parle encore une fois la découverte finie devient du
    // bruit — et le jour où on aura vraiment quelque chose à dire, personne
    // ne regardera plus cet endroit.
    assert.isNull(quelleAstuce(TOUTES, RIEN));
    assert.isFalse(ilResteAApprendre(TOUTES));
  });

  it("l'interface peut décider de ne rien afficher DU TOUT", () => {
    // Question différente de « laquelle » : pas d'espace réservé, pas de cadre
    // vide, sans avoir à interpréter un `null`.
    assert.isTrue(ilResteAApprendre(RIEN));
    assert.isTrue(ilResteAApprendre(new Set(["selecteur-de-projet"])));
  });
});

describe("ne pas répéter", () => {
  it("une astuce déjà vue passe son tour", () => {
    // Une astuce répétée en boucle est un reproche.
    const premiere = quelleAstuce(RIEN, RIEN);
    assert.isNotNull(premiere);
    const seconde = quelleAstuce(RIEN, new Set([premiere?.id ?? ""]));
    assert.notEqual(seconde?.id, premiere?.id);
  });

  it("toutes vues mais pas essayées : on repart du début plutôt que se taire", () => {
    // L'humain n'a toujours pas essayé ; l'astuce a encore un sens.
    const toutesVues = new Set(ASTUCES.map((astuce) => astuce.id));
    assert.isNotNull(quelleAstuce(RIEN, toutesVues));
  });

  it("un parcours complet découvre TOUTES les astuces, sans doublon", () => {
    // C'est ce qu'un tirage au sort rate : sur une liste de six, il en
    // répéterait la moitié avant d'avoir tout montré.
    const vues = new Set<string>();
    for (let tour = 0; tour < ASTUCES.length; tour += 1) {
      const astuce = quelleAstuce(RIEN, vues);
      assert.isNotNull(astuce, `tour ${String(tour)}`);
      assert.isFalse(vues.has(astuce?.id ?? ""), "doublon");
      vues.add(astuce?.id ?? "");
    }
    assert.equal(vues.size, ASTUCES.length);
  });
});

describe("les astuces elles-mêmes", () => {
  it("chacune a un identifiant unique", () => {
    assert.equal(new Set(ASTUCES.map((a) => a.id)).size, ASTUCES.length);
  });

  it("chacune nomme une capacité, sinon elle ne peut pas se retirer", () => {
    // Sans capacité, une astuce resterait proposée à vie même une fois la
    // chose découverte.
    for (const astuce of ASTUCES) {
      assert.isNotEmpty(astuce.capacite, astuce.id);
      assert.isNotEmpty(astuce.texte, astuce.id);
    }
  });
});
