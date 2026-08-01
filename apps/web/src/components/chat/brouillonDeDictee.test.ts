import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  brouillonDeDicteeEnAttente,
  deposerBrouillonDeDictee,
  oublierBrouillonDeDictee,
  reprendreBrouillonDeDictee,
} from "./brouillonDeDictee";

/**
 * Ce qui se teste ici, ce sont les trois façons de PERDRE ou de DOUBLER le
 * texte. Le cas nominal est trivial ; ce sont les autres qui décident si ce
 * module aide ou nuit.
 */
afterEach(() => {
  oublierBrouillonDeDictee();
});

describe("brouillonDeDictee", () => {
  it("rend ce qui a été déposé", () => {
    deposerBrouillonDeDictee("il faut corriger le swipe");
    expect(reprendreBrouillonDeDictee()).toBe("il faut corriger le swipe");
  });

  // LE CAS QUI COMPTE LE PLUS : reprendre deux fois collerait le texte en
  // double dans le composeur — on rendrait le message inutilisable pour avoir
  // voulu ne rien perdre.
  it("ne rend le brouillon QU'UNE fois", () => {
    deposerBrouillonDeDictee("une seule fois");
    expect(reprendreBrouillonDeDictee()).toBe("une seule fois");
    expect(reprendreBrouillonDeDictee()).toBeNull();
  });

  // Écraser un brouillon en attente avec du vide, c'est perdre ce qu'on venait
  // de sauver — la panne même que ce module existe pour empêcher.
  it("un dépôt VIDE n'écrase jamais un brouillon en attente", () => {
    deposerBrouillonDeDictee("ce qu il a dit");
    deposerBrouillonDeDictee("");
    deposerBrouillonDeDictee("   ");
    expect(reprendreBrouillonDeDictee()).toBe("ce qu il a dit");
  });

  it("ne dépose rien quand il n'y a rien à sauver", () => {
    deposerBrouillonDeDictee("   ");
    expect(brouillonDeDicteeEnAttente()).toBe(false);
    expect(reprendreBrouillonDeDictee()).toBeNull();
  });

  it("le texte est rendu nettoyé de ses bords", () => {
    deposerBrouillonDeDictee("  avec des espaces  ");
    expect(reprendreBrouillonDeDictee()).toBe("avec des espaces");
  });

  // Savoir s'il y a quelque chose ne doit pas le VOLER à celui qui le
  // reprendra ensuite.
  it("savoir qu'il y a un brouillon ne le consomme pas", () => {
    deposerBrouillonDeDictee("toujours là");
    expect(brouillonDeDicteeEnAttente()).toBe(true);
    expect(brouillonDeDicteeEnAttente()).toBe(true);
    expect(reprendreBrouillonDeDictee()).toBe("toujours là");
  });

  it("s'oublie sur demande — un fil ne récupère pas la dictée d'un autre", () => {
    deposerBrouillonDeDictee("fil precedent");
    oublierBrouillonDeDictee();
    expect(brouillonDeDicteeEnAttente()).toBe(false);
    expect(reprendreBrouillonDeDictee()).toBeNull();
  });
});
