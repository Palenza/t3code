import { assert, describe, it } from "@effect/vitest";

import {
  assomptionsPerimees,
  confronter,
  DELAI_DE_GRACE_MS,
  raconter,
  type Fenetre,
  type Surface,
} from "./JamaisExecute.ts";

const JOUR = 86_400_000;
const FENETRE: Fenetre = { debut: 0, fin: 30 * JOUR };
const RIEN = new Map<string, { compte: number; dernier: number }>();
const SANS_ASSOMPTION = new Map<string, string>();

const surface = (nom: string, depuis = 0): Surface => ({ nom, appelableDepuis: depuis });
const vu = (nom: string, compte = 1) => new Map([[nom, { compte, dernier: 5 * JOUR }]]);

describe("le cas qui a rendu ce module nécessaire", () => {
  it("une surface livrée depuis longtemps et jamais appelée est ACCUSÉE", () => {
    // Le 01/08 : 36 livrables, 7 305 tests verts, zéro appel. Les deux premiers
    // étages passaient au vert — parce qu'ils ont raison tous les deux.
    const lignes = confronter([surface("sante")], RIEN, FENETRE, SANS_ASSOMPTION);
    assert.equal(lignes[0]?.verdict.quoi, "JAMAIS VU");
  });

  it("l'accusation dit depuis COMBIEN de temps, pas seulement qu'elle est muette", () => {
    const lignes = confronter([surface("sante")], RIEN, FENETRE, SANS_ASSOMPTION);
    const v = lignes[0]?.verdict;
    if (v?.quoi === "JAMAIS VU") {
      assert.equal(v.depuisJours, 30);
      assert.include(v.pourquoi, "30.0 j");
      assert.include(v.pourquoi, "pas atteignable");
    }
  });

  it("une surface appelée n'est jamais accusée", () => {
    const lignes = confronter([surface("rappel")], vu("rappel", 12), FENETRE, SANS_ASSOMPTION);
    const v = lignes[0]?.verdict;
    assert.equal(v?.quoi, "observé");
    if (v?.quoi === "observé") assert.equal(v.appels, 12);
  });
});

describe("« jamais vu » a deux causes, et une seule est une trouvaille", () => {
  it("sans AUCUNE observation, on ne conclut rien (H4)", () => {
    // « Jamais appelé » serait une affirmation sur la surface ; la vérité est
    // qu'on n'a rien regardé.
    const lignes = confronter([surface("sante")], RIEN, null, SANS_ASSOMPTION);
    const v = lignes[0]?.verdict;
    assert.equal(v?.quoi, "hors-fenêtre");
    if (v?.quoi === "hors-fenêtre") assert.include(v.pourquoi, "on n'a rien regardé");
  });

  it("une surface née APRÈS la dernière observation ne peut pas être accusée", () => {
    // C'est le faux positif garanti : aucun appel n'aurait PU être enregistré.
    const lignes = confronter([surface("neuf", 31 * JOUR)], RIEN, FENETRE, SANS_ASSOMPTION);
    const v = lignes[0]?.verdict;
    assert.equal(v?.quoi, "hors-fenêtre");
    if (v?.quoi === "hors-fenêtre") assert.include(v.pourquoi, "APRÈS la dernière observation");
  });

  it("sous le délai de grâce, on attend au lieu d'accuser", () => {
    const lignes = confronter(
      [surface("frais", 30 * JOUR - DELAI_DE_GRACE_MS / 2)],
      RIEN,
      FENETRE,
      SANS_ASSOMPTION,
    );
    const v = lignes[0]?.verdict;
    assert.equal(v?.quoi, "trop-récent");
    if (v?.quoi === "trop-récent") assert.include(v.pourquoi, "Attendre suffit");
  });

  it("la frontière du délai de grâce se franchit dans le bon sens", () => {
    const juste = confronter(
      [surface("limite", 30 * JOUR - DELAI_DE_GRACE_MS)],
      RIEN,
      FENETRE,
      SANS_ASSOMPTION,
    );
    assert.equal(juste[0]?.verdict.quoi, "JAMAIS VU");
    const dessous = confronter(
      [surface("limite", 30 * JOUR - DELAI_DE_GRACE_MS + 1)],
      RIEN,
      FENETRE,
      SANS_ASSOMPTION,
    );
    assert.equal(dessous[0]?.verdict.quoi, "trop-récent");
  });

  it("la fenêtre borne l'observable — pas la date de naissance seule", () => {
    // Née avant le début des observations : ce qui compte est ce qu'on a PU
    // observer, donc la fenêtre entière, pas son âge réel.
    const lignes = confronter([surface("ancienne", -400 * JOUR)], RIEN, FENETRE, SANS_ASSOMPTION);
    const v = lignes[0]?.verdict;
    if (v?.quoi === "JAMAIS VU") assert.equal(v.depuisJours, 30);
  });
});

describe("les silences assumés, et leur péremption", () => {
  it("un silence avec sa raison n'est pas une accusation", () => {
    const lignes = confronter(
      [surface("sante")],
      RIEN,
      FENETRE,
      new Map([["sante", "aucun fournisseur branché"]]),
    );
    const v = lignes[0]?.verdict;
    assert.equal(v?.quoi, "jamais-vu-assumé");
    if (v?.quoi === "jamais-vu-assumé") assert.include(v.pourquoi, "aucun fournisseur");
  });

  it("une assomption devenue FAUSSE est signalée", () => {
    // Une dérogation qu'on n'enlève jamais finit par couvrir un vrai problème,
    // et raconte une histoire fausse à qui la lit. Le garde d'appelants m'a
    // attrapé trois fois là-dessus en une nuit.
    const assumes = new Map([["rappel", "pas encore branché"]]);
    const lignes = confronter([surface("rappel")], vu("rappel"), FENETRE, assumes);
    assert.deepEqual(assomptionsPerimees(lignes, assumes), ["rappel"]);
  });

  it("une assomption encore vraie ne se signale pas", () => {
    const assumes = new Map([["sante", "pas encore branché"]]);
    const lignes = confronter([surface("sante")], RIEN, FENETRE, assumes);
    assert.lengthOf(assomptionsPerimees(lignes, assumes), 0);
  });

  it("le délai de grâce PRIME sur l'assomption — inutile d'assumer un silence normal", () => {
    const lignes = confronter(
      [surface("frais", 30 * JOUR - 1000)],
      RIEN,
      FENETRE,
      new Map([["frais", "raison inutile"]]),
    );
    assert.equal(lignes[0]?.verdict.quoi, "trop-récent");
  });
});

describe("le compte-rendu parle à quelqu'un qui doit AGIR", () => {
  it("il commence par le nombre de muettes, seule ligne qui demande quelque chose", () => {
    const texte = raconter(
      confronter([surface("a"), surface("b")], vu("a"), FENETRE, SANS_ASSOMPTION),
    );
    assert.include(texte, "1 surface(s) LIVRÉE(S) ET JAMAIS APPELÉE(S)");
  });

  it("il rappelle POURQUOI les deux autres étages ne suffisaient pas", () => {
    const texte = raconter(confronter([surface("a")], RIEN, FENETRE, SANS_ASSOMPTION));
    assert.include(texte, "un appelant qu'il est atteignable");
  });

  it("zéro muette se dit sans dramatiser", () => {
    const texte = raconter(confronter([surface("a")], vu("a"), FENETRE, SANS_ASSOMPTION));
    assert.include(texte, "Aucune surface muette sans raison");
  });

  it("zéro surface se distingue de zéro muette", () => {
    assert.include(raconter([]), "Aucune surface déclarée");
    assert.include(raconter([]), "rien à en conclure");
  });
});

describe("l'ordre et la forme", () => {
  it("les surfaces sortent triées, pour que deux relevés se comparent", () => {
    const lignes = confronter(
      [surface("zeta"), surface("alpha"), surface("mu")],
      RIEN,
      FENETRE,
      SANS_ASSOMPTION,
    );
    assert.deepEqual(
      lignes.map((l) => l.surface),
      ["alpha", "mu", "zeta"],
    );
  });

  it("un compte d'appels à zéro vaut une absence, pas une observation", () => {
    const lignes = confronter([surface("a")], vu("a", 0), FENETRE, SANS_ASSOMPTION);
    assert.equal(lignes[0]?.verdict.quoi, "JAMAIS VU");
  });
});
