import { assert, describe, it } from "@effect/vitest";

import { controlerSkill } from "../../../skills/NormesDeSkill.ts";
import { identiteDeLaMachine } from "./handlers.ts";

describe("ce que la machine sait de l'humain", () => {
  it("ramasse le nom de session depuis le HOME, pas seulement depuis USER", () => {
    // `USER` n'est pas posé partout — un serveur lancé par systemd, un
    // conteneur. Le home, lui, existe toujours, et il porte la même donnée.
    assert.deepEqual(identiteDeLaMachine({ HOME: "/Users/prenom.nom" }), ["prenom.nom"]);
  });

  it("ne rend pas deux fois la même identité", () => {
    assert.deepEqual(identiteDeLaMachine({ HOME: "/home/lea", USER: "lea" }), ["lea"]);
  });

  it("ramasse les trois quand elles diffèrent", () => {
    const identites = identiteDeLaMachine({
      HOME: "/Users/prenom.nom",
      USER: "prenom",
      USERNAME: "PRENOM",
    });
    assert.sameMembers([...identites], ["prenom", "PRENOM", "prenom.nom"]);
  });

  it("un HOME sous Windows se découpe aussi", () => {
    assert.deepEqual(identiteDeLaMachine({ USERPROFILE: "C:\\Users\\lea" }), ["lea"]);
  });

  it("un environnement vide ne rend rien plutôt que des chaînes vides", () => {
    // Une chaîne vide passée au contrôle matcherait TOUT auteur : le garde
    // se retournerait contre les skills saines.
    assert.deepEqual(identiteDeLaMachine({}), []);
    assert.deepEqual(identiteDeLaMachine({ HOME: "", USER: "" }), []);
  });
});

describe("bout à bout : l'identité alimente vraiment le contrôle", () => {
  const skill = (auteur: string) =>
    [
      "---",
      "name: ranger-les-fils",
      "description: Range les fils.",
      `author: ${auteur}`,
      "---",
      "",
    ].join("\n");

  it("un auteur pris à la machine est une ERREUR", () => {
    // Le cas qui compte : sur la machine d'origine, ça ressemble juste à un
    // champ rempli. La fuite ne se voit qu'ailleurs, trop tard.
    const manquements = controlerSkill({
      texte: skill("prenom.nom"),
      identiteDeLaMachine: identiteDeLaMachine({ HOME: "/Users/prenom.nom" }),
    });
    const fuite = manquements.find((m) => m.regle === "auteur-pris-a-la-machine");
    assert.isDefined(fuite);
    assert.equal(fuite?.gravite, "erreur");
  });

  it("un nom de projet passe sans rien dire", () => {
    const manquements = controlerSkill({
      texte: skill("Palenza"),
      identiteDeLaMachine: identiteDeLaMachine({ HOME: "/Users/prenom.nom" }),
    });
    assert.isUndefined(manquements.find((m) => m.regle === "auteur-pris-a-la-machine"));
  });
});
