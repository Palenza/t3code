import { assert, describe, it } from "@effect/vitest";

import { choisirLaVoix, monterLaVoix, type MoteurDeVoix } from "./Parler.ts";

/** Un moteur qui note ce qu'on lui demande, et qu'on fait avancer à la main. */
function moteurDeTest(voix: ReadonlyArray<{ nom: string; langue: string }> = []) {
  const dites: Array<{ texte: string; voix: string | null }> = [];
  const finir: Array<() => void> = [];
  let taires = 0;

  const moteur: MoteurDeVoix = {
    parler: (texte, choisie) => {
      dites.push({ texte, voix: choisie });
      return new Promise<void>((resoudre) => finir.push(resoudre));
    },
    taire: () => {
      taires += 1;
    },
    voixDisponibles: () => voix,
  };

  return {
    moteur,
    dites,
    taires: () => taires,
    /** Fait aboutir l'énonciation en cours. */
    acheverUne: async () => {
      finir.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("choisir la voix", () => {
  it("préfère fr-FR quand elle existe", () => {
    const choisie = choisirLaVoix([
      { nom: "Alex", langue: "en-US" },
      { nom: "Amélie", langue: "fr-CA" },
      { nom: "Thomas", langue: "fr-FR" },
    ]);
    assert.equal(choisie, "Thomas");
  });

  it("accepte une autre voix française plutôt que rien", () => {
    // Une voix québécoise lisant du français est infiniment plus claire
    // qu'une voix anglaise.
    assert.equal(
      choisirLaVoix([
        { nom: "Alex", langue: "en-US" },
        { nom: "Amélie", langue: "fr-CA" },
      ]),
      "Amélie",
    );
  });

  it("sans voix française, on ne parle PAS", () => {
    // Un silence se comprend, un charabia non : « les tests passent » lu par
    // une voix anglaise est inaudible.
    assert.isNull(choisirLaVoix([{ nom: "Alex", langue: "en-US" }]));
    assert.isNull(choisirLaVoix([]));
  });
});

describe("une énonciation à la fois", () => {
  it("la seconde attend que la première finisse", async () => {
    // C'est ce qui permet de couper net : si on remplissait la file du
    // navigateur, `taire()` devrait annuler ce qu'on ne contrôle plus.
    const t = moteurDeTest([{ nom: "Thomas", langue: "fr-FR" }]);
    const voix = monterLaVoix(t.moteur);

    voix.dire(["Première phrase.", "Deuxième phrase."]);
    assert.lengthOf(t.dites, 1);
    assert.equal(t.dites[0]?.texte, "Première phrase.");
    assert.equal(voix.enAttente(), 1);

    await t.acheverUne();
    assert.lengthOf(t.dites, 2);
    assert.equal(t.dites[1]?.texte, "Deuxième phrase.");
  });

  it("la voix française choisie est bien transmise au moteur", async () => {
    const t = moteurDeTest([{ nom: "Thomas", langue: "fr-FR" }]);
    monterLaVoix(t.moteur).dire(["Bonjour."]);
    assert.equal(t.dites[0]?.voix, "Thomas");
  });
});

describe("taire", () => {
  it("coupe le moteur ET vide ce qui restait", () => {
    const t = moteurDeTest([{ nom: "Thomas", langue: "fr-FR" }]);
    const voix = monterLaVoix(t.moteur);

    voix.dire(["Un.", "Deux.", "Trois."]);
    assert.equal(voix.enAttente(), 2);

    voix.taire();
    assert.equal(voix.enAttente(), 0);
    assert.equal(t.taires(), 1);
  });

  it("ce qui parlait ne relance PAS la suite en se terminant", async () => {
    // Le piège : l'énonciation coupée aboutit quand même, et sa continuation
    // repartirait sur la file du tour SUIVANT. L'agent répondrait par-dessus
    // sa réponse d'avant.
    const t = moteurDeTest([{ nom: "Thomas", langue: "fr-FR" }]);
    const voix = monterLaVoix(t.moteur);

    voix.dire(["Ancien tour."]);
    voix.taire();
    voix.dire(["Nouveau tour."]);

    const avant = t.dites.length;
    await t.acheverUne(); // l'ancienne énonciation se termine
    // Elle ne doit avoir déclenché aucune énonciation supplémentaire.
    assert.lengthOf(t.dites, avant);
  });
});

describe("un échec de synthèse ne rend pas muet pour de bon", () => {
  it("la phrase suivante part quand même", async () => {
    // Perdre une phrase est ennuyeux ; rester muet jusqu'au rechargement ne
    // se répare pas.
    const dites: string[] = [];
    let premier = true;
    const moteur: MoteurDeVoix = {
      parler: (texte) => {
        dites.push(texte);
        if (premier) {
          premier = false;
          return Promise.reject(new Error("synthèse indisponible"));
        }
        return Promise.resolve();
      },
      taire: () => undefined,
      voixDisponibles: () => [{ nom: "Thomas", langue: "fr-FR" }],
    };

    monterLaVoix(moteur).dire(["Celle qui casse.", "Celle qui suit."]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(dites, ["Celle qui casse.", "Celle qui suit."]);
  });
});
