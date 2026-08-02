import { assert, describe, it } from "@effect/vitest";

import { AIDE, COMMANDES, lireUneCommande } from "./LireUneCommande.ts";

describe("le piège des salons partagés", () => {
  it("une commande suffixée à NOTRE nom est pour nous", () => {
    const lu = lireUneCommande("/platforms@t3bot", "t3bot");
    assert.equal(lu.quoi, "commande");
    if (lu.quoi === "commande") assert.equal(lu.nom, "platforms");
  });

  it("suffixée à un AUTRE bot : on se tait complètement", () => {
    // Répondre ferait parler deux agents en même temps, et l'humain ne
    // saurait pas lequel lui a répondu.
    const lu = lireUneCommande("/platforms@autrebot", "t3bot");
    assert.equal(lu.quoi, "pas-pour-nous");
    if (lu.quoi === "pas-pour-nous") assert.equal(lu.destinataire, "autrebot");
  });

  it("SANS suffixe, c'est pour nous — sinon le bot est muet en tête-à-tête", () => {
    assert.equal(lireUneCommande("/platforms", "t3bot").quoi, "commande");
  });

  it("la casse du nom de bot ne décide de rien", () => {
    assert.equal(lireUneCommande("/platforms@T3Bot", "t3bot").quoi, "commande");
  });
});

describe("ce qui n'est PAS une commande", () => {
  it("un chemin collé reste un message", () => {
    // Répondre « commande inconnue » à quelqu'un qui colle un chemin
    // apprendrait à ne plus rien coller.
    for (const texte of ["/usr/local/bin/node", "/home/enzo/Documents", "/^\\d+$/"]) {
      const lu = lireUneCommande(texte, "t3bot");
      assert.equal(lu.quoi, "message", texte);
      if (lu.quoi === "message") assert.equal(lu.texte, texte);
    }
  });

  it("un texte ordinaire aussi", () => {
    const lu = lireUneCommande("  relance l'usine  ", "t3bot");
    assert.equal(lu.quoi, "message");
    if (lu.quoi === "message") assert.equal(lu.texte, "relance l'usine");
  });
});

describe("ce que la commande emporte avec elle", () => {
  it("le reste de la ligne est conservé, coupé de ses espaces", () => {
    const lu = lireUneCommande("/sethome   ~/Documents/Palenza  ", "t3bot");
    assert.equal(lu.quoi, "commande");
    if (lu.quoi === "commande") {
      assert.equal(lu.nom, "sethome");
      assert.equal(lu.reste, "~/Documents/Palenza");
    }
  });

  it("une commande seule a un reste vide, pas indéfini", () => {
    const lu = lireUneCommande("/platforms", "t3bot");
    if (lu.quoi === "commande") assert.equal(lu.reste, "");
  });

  it("le reste survit au suffixe de bot", () => {
    const lu = lireUneCommande("/clarify@t3bot oui, la première", "t3bot");
    if (lu.quoi === "commande") {
      assert.equal(lu.nom, "clarify");
      assert.equal(lu.reste, "oui, la première");
    }
  });
});

describe("l'aide", () => {
  it("nomme toutes les commandes reconnues — aucune orpheline", () => {
    // Une aide qui diverge des commandes réelles est pire qu'une aide
    // absente : elle apprend des commandes qui n'existent pas.
    for (const commande of COMMANDES) {
      assert.include(AIDE, `/${commande}`, commande);
    }
  });
});
