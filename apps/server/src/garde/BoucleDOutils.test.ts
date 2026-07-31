import { assert, describe, it } from "@effect/vitest";

import {
  GardeDeBoucle,
  peutAvoirUnEffet,
  REPETITIONS_AVEC_EFFET,
  REPETITIONS_SANS_EFFET,
  effetInconnu,
} from "./BoucleDOutils.ts";

const lire = (chemin: string) => ({ outil: "Read", arguments: chemin });
const ecrire = (chemin: string) => ({ outil: "Write", arguments: chemin });

describe("peutAvoirUnEffet", () => {
  it("un outil INCONNU est supposé avoir un effet", () => {
    // Se tromper en croyant un outil inoffensif fait rejouer une écriture ;
    // se tromper dans l'autre sens fait relire un fichier. Le gate se trompe
    // du côté qui n'écrit rien.
    assert.isTrue(peutAvoirUnEffet("UnOutilQuiVientDArriver"));
    assert.isTrue(peutAvoirUnEffet("Bash"));
    assert.isTrue(peutAvoirUnEffet("Write"));
  });

  it("Bash est d'effet INCONNU, ni l'un ni l'autre", () => {
    assert.isTrue(effetInconnu("Bash"));
    assert.isFalse(effetInconnu("Write"));
    assert.isFalse(effetInconnu("Read"));
  });

  it("connaît les inoffensifs, y compris les nôtres", () => {
    for (const outil of ["Read", "Grep", "rappel", "preuve", "repo_map"]) {
      assert.isFalse(peutAvoirUnEffet(outil), outil);
    }
  });
});

describe("GardeDeBoucle", () => {
  it("laisse passer une relecture — vérifier n'est pas boucler", () => {
    const garde = new GardeDeBoucle();
    assert.equal(garde.observer(lire("a.ts")).verdict, "continue");
    assert.equal(garde.observer(lire("a.ts")).verdict, "continue");
  });

  it("parle à la TROISIÈME lecture identique", () => {
    const garde = new GardeDeBoucle();
    garde.observer(lire("a.ts"));
    garde.observer(lire("a.ts"));
    const d = garde.observer(lire("a.ts"));
    assert.equal(d.verdict, "boucle");
    if (d.verdict !== "boucle") return;
    assert.equal(d.combien, REPETITIONS_SANS_EFFET);
    assert.include(d.quoiFaire, "ne peut pas avoir changé");
  });

  it("UNE ÉCRITURE remet les lectures à zéro — le monde a bougé", () => {
    // C'est le cœur du module : le signal n'est pas la répétition, c'est la
    // répétition SANS PROGRÈS.
    const garde = new GardeDeBoucle();
    garde.observer(lire("a.ts"));
    garde.observer(lire("a.ts"));
    garde.observer(ecrire("a.ts"));
    assert.equal(garde.observer(lire("a.ts")).verdict, "continue");
    assert.equal(garde.observer(lire("a.ts")).verdict, "continue");
  });

  it("est plus sévère pour ce qui ÉCRIT", () => {
    // Réécrire exactement le même contenu au même endroit n'a jamais de
    // raison d'être : la deuxième fois suffit à le dire.
    const garde = new GardeDeBoucle();
    assert.equal(garde.observer(ecrire("a.ts")).verdict, "continue");
    const d = garde.observer(ecrire("a.ts"));
    assert.equal(d.verdict, "boucle");
    if (d.verdict !== "boucle") return;
    assert.equal(d.combien, REPETITIONS_AVEC_EFFET);
    assert.include(d.quoiFaire, "ne change rien");
  });

  it("distingue des arguments DIFFÉRENTS", () => {
    const garde = new GardeDeBoucle();
    for (const chemin of ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]) {
      assert.equal(garde.observer(lire(chemin)).verdict, "continue", chemin);
    }
  });

  it("distingue des OUTILS différents sur le même argument", () => {
    const garde = new GardeDeBoucle();
    assert.equal(garde.observer({ outil: "Read", arguments: "a.ts" }).verdict, "continue");
    assert.equal(garde.observer({ outil: "Grep", arguments: "a.ts" }).verdict, "continue");
    assert.equal(garde.observer({ outil: "Glob", arguments: "a.ts" }).verdict, "continue");
  });

  it("compte l'écriture répétée MALGRÉ la remise à zéro qu'elle provoque", () => {
    // Piège d'implémentation : si l'écriture oublie tout AVANT de se compter,
    // elle ne se compterait jamais elle-même et la boucle d'écriture
    // passerait pour toujours.
    const garde = new GardeDeBoucle();
    garde.observer(ecrire("a.ts"));
    assert.equal(garde.observer(ecrire("a.ts")).verdict, "boucle");
  });

  it("laisse Bash se répéter DEUX fois — relancer une vérification est légitime", () => {
    // Mesuré sur 6 927 appels réels : au seuil des écritures, le garde criait
    // sur des relances saines (le contrôle des quatre lanes après une
    // correction). Un garde qui crie sur du sain se fait désactiver.
    const garde = new GardeDeBoucle();
    const bash = { outil: "Bash", arguments: "for ip in 1.2.3.4; do ping $ip; done" };
    assert.equal(garde.observer(bash).verdict, "continue");
    assert.equal(garde.observer(bash).verdict, "continue");
    assert.equal(garde.observer(bash).verdict, "boucle");
  });

  it("Bash remet quand même les lectures à zéro — le monde a PU changer", () => {
    // On tranche des deux côtés prudents : seuil clément pour l'accuser,
    // remise à zéro généreuse pour ce qu'il a pu modifier.
    const garde = new GardeDeBoucle();
    garde.observer(lire("a.ts"));
    garde.observer(lire("a.ts"));
    garde.observer({ outil: "Bash", arguments: "pnpm exec vp fmt --write a.ts" });
    assert.equal(garde.observer(lire("a.ts")).verdict, "continue");
  });

  it("repart de zéro à chaque tour", () => {
    const garde = new GardeDeBoucle();
    garde.observer(lire("a.ts"));
    garde.observer(lire("a.ts"));
    garde.nouveauTour();
    assert.equal(garde.observer(lire("a.ts")).verdict, "continue");
    assert.equal(garde.observer(lire("a.ts")).verdict, "continue");
  });

  it("nomme l'outil et le compte — un agent répare « appelé 3 fois »", () => {
    const garde = new GardeDeBoucle();
    garde.observer(lire("a.ts"));
    garde.observer(lire("a.ts"));
    const d = garde.observer(lire("a.ts"));
    if (d.verdict !== "boucle") return assert.fail("boucle attendue");
    assert.equal(d.outil, "Read");
    assert.include(d.quoiFaire, "Read");
    assert.include(d.quoiFaire, "3 fois");
  });
});
