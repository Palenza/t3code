import { assert, describe, it } from "@effect/vitest";

import {
  grapheDApprentissage,
  OBSERVATIONS_MINIMUM,
  raconterLeGraphe,
  type Mutation,
  type Observation,
} from "./GrapheDApprentissage.ts";

const JOUR = 86_400_000;
const FIN = 100 * JOUR;

const mutation = (quand: number, skill = "aspirer"): Mutation => ({
  skill,
  quand,
  libelle: `mutation à ${String(quand / JOUR)}`,
});

/** `n` usages autour de `quand`, dont `reussis` réussis. */
const usages = (
  quand: number,
  n: number,
  reussis: number,
  skill = "aspirer",
): ReadonlyArray<Observation> =>
  Array.from({ length: n }, (_, i) => ({ skill, quand: quand + i, reussi: i < reussis }));

describe("la corrélation, quand elle est réellement là", () => {
  it("une amélioration nette se dit", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR)],
      [...usages(1 * JOUR, 10, 2), ...usages(11 * JOUR, 10, 9)],
      FIN,
    );
    assert.lengthOf(lignes, 1);
    assert.equal(lignes[0]?.verdict.quoi, "amélioration");
  });

  it("une régression aussi — le graphe n'est pas là pour flatter", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR)],
      [...usages(1 * JOUR, 10, 9), ...usages(11 * JOUR, 10, 2)],
      FIN,
    );
    assert.equal(lignes[0]?.verdict.quoi, "régression");
  });
});

describe("le petit nombre — si une observation efface l'écart, il n'y a pas d'écart", () => {
  it("8/10 → 9/10 ne suffit pas : une observation retournée l'annule", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR)],
      [...usages(1 * JOUR, 10, 8), ...usages(11 * JOUR, 10, 9)],
      FIN,
    );
    assert.equal(lignes[0]?.verdict.quoi, "sans-effet-mesurable");
  });

  it("le test s'adapte à la taille, sans constante", () => {
    // Le même écart de 10 points survit sur 100 observations : une seule y
    // pèse 1 point, plus 10.
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR)],
      [...usages(1 * JOUR, 100, 80), ...usages(11 * JOUR, 100, 90)],
      FIN,
    );
    assert.equal(lignes[0]?.verdict.quoi, "amélioration");
  });

  it("un écart nul n'est jamais un verdict", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR)],
      [...usages(1 * JOUR, 10, 5), ...usages(11 * JOUR, 10, 5)],
      FIN,
    );
    assert.equal(lignes[0]?.verdict.quoi, "sans-effet-mesurable");
  });
});

describe("le plancher, et le cas qui le distingue de la robustesse", () => {
  it("0/2 puis 5/5 : la robustesse laisserait passer, le plancher refuse", () => {
    // L'écart survit à une observation retournée (+50 points), donc le test
    // de robustesse le déclare solide — alors que « 2 observations » ne
    // décrit rien. C'est exactement le cas qui justifie les DEUX règles.
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR)],
      [...usages(1 * JOUR, 2, 0), ...usages(11 * JOUR, 5, 5)],
      FIN,
    );
    assert.equal(lignes[0]?.verdict.quoi, "pas-assez-de-preuves");
  });

  it("le refus dit combien il manque, pas seulement qu'il manque (A7)", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR)],
      [...usages(1 * JOUR, 2, 0), ...usages(11 * JOUR, 20, 20), ...usages(50 * JOUR, 1, 1)],
      FIN,
    );
    const verdict = lignes[0]?.verdict;
    assert.equal(verdict?.quoi, "pas-assez-de-preuves");
    if (verdict?.quoi === "pas-assez-de-preuves") {
      assert.equal(verdict.manque, OBSERVATIONS_MINIMUM - 2);
      assert.include(verdict.pourquoi, "2 observation(s) avant");
      assert.include(verdict.pourquoi, String(OBSERVATIONS_MINIMUM));
    }
  });
});

describe("le voisin — l'effet d'une mutation ne se met pas au compte d'une autre", () => {
  it("la fenêtre d'après s'arrête à la mutation suivante", () => {
    // Sans cette borne, l'« après » de la première mutation contiendrait les
    // 20 réussites qui suivent la SECONDE, et lui attribuerait son effet.
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR), mutation(20 * JOUR)],
      [...usages(1 * JOUR, 10, 1), ...usages(11 * JOUR, 10, 1), ...usages(21 * JOUR, 20, 20)],
      FIN,
    );
    assert.lengthOf(lignes, 2);
    // La première n'a rien amélioré : son après s'arrête au jour 20.
    assert.equal(lignes[0]?.verdict.quoi, "sans-effet-mesurable");
    // La seconde porte l'amélioration, et elle seule.
    assert.equal(lignes[1]?.verdict.quoi, "amélioration");
  });

  it("la fenêtre d'avant commence à la mutation précédente", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR), mutation(20 * JOUR)],
      [...usages(1 * JOUR, 10, 10), ...usages(11 * JOUR, 10, 1), ...usages(21 * JOUR, 10, 1)],
      FIN,
    );
    // L'avant de la seconde, c'est le jour 11-20 (1/10), pas le jour 1.
    assert.equal(lignes[1]?.verdict.quoi, "sans-effet-mesurable");
  });

  it("chaque skill a ses propres fenêtres", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR, "a"), mutation(10 * JOUR, "b")],
      [
        ...usages(1 * JOUR, 10, 1, "a"),
        ...usages(11 * JOUR, 10, 10, "a"),
        ...usages(1 * JOUR, 10, 10, "b"),
        ...usages(11 * JOUR, 10, 1, "b"),
      ],
      FIN,
    );
    assert.equal(lignes.find((l) => l.mutation.skill === "a")?.verdict.quoi, "amélioration");
    assert.equal(lignes.find((l) => l.mutation.skill === "b")?.verdict.quoi, "régression");
  });
});

describe("ce qu'on ne sait pas encore ≠ ce qui n'a rien donné", () => {
  it("une fenêtre d'après encore ouverte donne « trop-récent », pas « pas assez »", () => {
    // Les deux manquent de preuves ; le conseil diffère. Ici : attendre.
    const lignes = grapheDApprentissage(
      [mutation(99 * JOUR)],
      [...usages(1 * JOUR, 10, 5), ...usages(99 * JOUR + 1, 1, 1)],
      FIN,
    );
    const verdict = lignes[0]?.verdict;
    assert.equal(verdict?.quoi, "trop-récent");
    if (verdict?.quoi === "trop-récent") assert.include(verdict.pourquoi, "attendre suffit");
  });

  it("une fenêtre REFERMÉE dit que le verdict ne viendra pas tout seul", () => {
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR), mutation(20 * JOUR)],
      [...usages(1 * JOUR, 10, 5), ...usages(11 * JOUR, 1, 1), ...usages(21 * JOUR, 10, 5)],
      FIN,
    );
    const verdict = lignes[0]?.verdict;
    assert.equal(verdict?.quoi, "pas-assez-de-preuves");
    if (verdict?.quoi === "pas-assez-de-preuves") {
      assert.include(verdict.pourquoi, "ne viendra pas tout seul");
    }
  });

  it("une skill jamais utilisée est un FAIT, pas un manque de preuves", () => {
    const lignes = grapheDApprentissage([mutation(10 * JOUR)], [], FIN);
    const verdict = lignes[0]?.verdict;
    assert.equal(verdict?.quoi, "jamais-observée");
    if (verdict?.quoi === "jamais-observée") assert.include(verdict.pourquoi, "vaut par lui-même");
  });
});

describe("le récit — il commence par ce qu'on ne sait pas", () => {
  it("zéro jugeable ne se lit PAS comme « les changements n'ont rien donné »", () => {
    const texte = raconterLeGraphe(grapheDApprentissage([mutation(10 * JOUR)], [], FIN));
    assert.include(texte, "0 jugeable");
    assert.include(texte, "on ne peut pas encore le dire");
  });

  it("il donne le rapport jugeable/total, pas seulement les verdicts trouvés", () => {
    // « on a mesuré » ne doit pas se lire là où la vérité est « on a mesuré
    // deux choses sur quarante ».
    const lignes = grapheDApprentissage(
      [mutation(10 * JOUR, "a"), mutation(10 * JOUR, "b")],
      [...usages(1 * JOUR, 10, 1, "a"), ...usages(11 * JOUR, 10, 10, "a")],
      FIN,
    );
    const texte = raconterLeGraphe(lignes);
    assert.include(texte, "2 mutation(s) examinée(s), 1 jugeable");
  });

  it("aucune mutation se distingue d'aucun verdict", () => {
    const texte = raconterLeGraphe([]);
    assert.include(texte, "Aucune mutation");
    assert.include(texte, "rien à en conclure");
  });
});
