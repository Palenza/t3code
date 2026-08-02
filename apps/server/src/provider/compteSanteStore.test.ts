import type { ProviderInstanceId } from "@t3tools/contracts";
import { assert, beforeEach, describe, it } from "vite-plus/test";

import { classerEchec, type SanteCompte } from "./comptePool.ts";
import {
  comptesUtilisables,
  noterEchec,
  noterSucces,
  reveiller,
  santeDe,
  surChangementDeSante,
  viderSantes,
} from "./compteSanteStore.ts";

const MAINTENANT = Date.parse("2026-07-29T22:00:00.000Z");
const id = (valeur: string) => valeur as ProviderInstanceId;

const quotaAtteint = () =>
  classerEchec({ code: 429, message: "usage limit reached", maintenant: MAINTENANT });
const jetonRevoque = () =>
  classerEchec({ code: 401, message: "token_revoked", maintenant: MAINTENANT });

describe("registre de santé des comptes", () => {
  beforeEach(viderSantes);

  it("un compte inconnu est sain — on ne suspecte personne par défaut", () => {
    assert.deepStrictEqual(santeDe(id("A")), { instanceId: id("A"), etat: "ok" });
  });

  it("un quota atteint écarte le compte jusqu'à son heure de reprise", () => {
    noterEchec(id("A"), quotaAtteint(), "usage limit reached", MAINTENANT);

    const sante = santeDe(id("A"));
    assert.strictEqual(sante.etat, "refroidissement");
    assert.strictEqual(sante.repriseA, "2026-07-29T23:00:00.000Z");
    assert.deepStrictEqual(comptesUtilisables([id("A"), id("B")], MAINTENANT), [id("B")]);
  });

  it("le refroidissement se lève tout seul à l'heure dite", () => {
    noterEchec(id("A"), quotaAtteint(), "usage limit reached", MAINTENANT);

    const uneHeureApres = MAINTENANT + 3_600_000;
    assert.deepStrictEqual(comptesUtilisables([id("A")], uneHeureApres), [id("A")]);
  });

  it("un jeton révoqué ne revient jamais, même dans cent jours", () => {
    noterEchec(id("A"), jetonRevoque(), "token_revoked", MAINTENANT);

    assert.strictEqual(santeDe(id("A")).etat, "mort");
    assert.deepStrictEqual(comptesUtilisables([id("A")], MAINTENANT + 100 * 86_400_000), []);
  });

  it("une réussite répare un compte marqué mort à tort", () => {
    // La seule preuve qui vaut : si un tour passe, le compte est bon, quoi
    // qu'on ait déduit d'un message d'erreur mal formulé.
    noterEchec(id("A"), jetonRevoque(), "token_revoked", MAINTENANT);
    noterSucces(id("A"));

    assert.strictEqual(santeDe(id("A")).etat, "ok");
  });

  it("reveiller() ressuscite un mort — c'est le SEUL chemin de retour", () => {
    // Un compte mort est exclu du choix, donc ne reçoit plus de tour, donc
    // `noterSucces` ne peut plus le guérir tout seul. Sans ce geste (branché
    // le 02/08 sur /api/comptes/reveiller), il restait hors rotation jusqu'au
    // redémarrage de l'app.
    noterEchec(id("A"), jetonRevoque(), "token_revoked", MAINTENANT);
    assert.deepStrictEqual(comptesUtilisables([id("A")], MAINTENANT), []);

    reveiller(id("A"));
    assert.strictEqual(santeDe(id("A")).etat, "ok");
    assert.deepStrictEqual(comptesUtilisables([id("A")], MAINTENANT), [id("A")]);
  });

  it("n'ameute les abonnés que quand l'état bouge vraiment", () => {
    let tics = 0;
    const stop = surChangementDeSante(() => {
      tics += 1;
    });

    noterEchec(id("A"), quotaAtteint(), "usage limit reached", MAINTENANT);
    // Trois échecs de plus pendant le même refroidissement : rien n'a changé,
    // l'interface ne doit pas se repeindre trois fois.
    noterEchec(id("A"), quotaAtteint(), "usage limit reached", MAINTENANT);
    noterEchec(id("A"), quotaAtteint(), "usage limit reached", MAINTENANT);
    noterEchec(id("A"), quotaAtteint(), "usage limit reached", MAINTENANT);

    stop();
    assert.strictEqual(tics, 1);
  });

  it("une réussite sur un compte déjà sain ne réveille personne", () => {
    let tics = 0;
    const stop = surChangementDeSante(() => {
      tics += 1;
    });

    noterSucces(id("A"));

    stop();
    assert.strictEqual(tics, 0);
  });

  it("« notre faute » ne condamne aucun compte", () => {
    const verdict = classerEchec({
      code: 400,
      message: "messages: field required",
      maintenant: MAINTENANT,
    });
    noterEchec(id("A"), verdict, "requête invalide", MAINTENANT);

    assert.strictEqual(santeDe(id("A")).etat, "ok");
    assert.deepStrictEqual(comptesUtilisables([id("A")], MAINTENANT), [id("A")]);
  });
});

describe("le compteur d'échecs d'affilée", () => {
  beforeEach(viderSantes);

  const hoquet = (quand: number = MAINTENANT) =>
    classerEchec({ code: 500, message: "upstream hiccup", maintenant: quand });

  /**
   * L'échec SUIVANT, une seconde après la reprise du précédent.
   *
   * L'échelle ne monte qu'entre incidents DISTINCTS : un échec pendant un
   * refroidissement déjà ouvert est le même hoquet vu par un autre fil, et ne
   * compte pas (garde d'échelle du 02/08, volée à cliproxy). Pour éprouver la
   * rampe, chaque échec doit donc franchir la reprise du précédent.
   */
  const incidentSuivant = (apres: SanteCompte): SanteCompte => {
    const quand = Date.parse(apres.repriseA ?? "") + 1_000;
    return noterEchec(id("A"), hoquet(quand), "500", quand);
  };

  it("survit d'un INCIDENT à l'autre, même quand l'écran ne change pas", () => {
    // Le registre ne PRÉVIENT les abonnés que si l'état visible bouge. Le
    // piège historique : cette économie d'affichage jetait aussi le compteur,
    // et l'attente ne grandissait jamais. Le compteur doit donc survivre d'un
    // incident au suivant — trois incidents séparés par leurs reprises.
    const un = noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    const deux = incidentSuivant(un);
    const trois = incidentSuivant(deux);
    assert.strictEqual(trois.echecsDAffilee, 3);
    assert.strictEqual(santeDe(id("A")).echecsDAffilee, 3);
  });

  it("une RAFALE sur le même hoquet ne compte qu'UNE fois", () => {
    // Reçu cliproxy, rejoué le 02/08 : cinq fils en vol voient le même hoquet
    // réseau de 30 s — cinq appels, UN incident. Avant la garde, cette rafale
    // donnait 1 h, 1 h, 4 h, 4 h, 12 h : le compte était écarté une
    // demi-journée pour trente secondes de réseau.
    const attentes = [1, 2, 3, 4, 5].map(
      () =>
        (Date.parse(noterEchec(id("A"), hoquet(), "500", MAINTENANT).repriseA ?? "") - MAINTENANT) /
        3_600_000,
    );
    assert.deepStrictEqual(attentes, [1, 1, 1, 1, 1]);
    assert.strictEqual(santeDe(id("A")).echecsDAffilee, 1);
  });

  it("une réussite REMET tout à zéro — c'est la seule preuve qui vaut", () => {
    noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    noterSucces(id("A"));
    assert.strictEqual(santeDe(id("A")).echecsDAffilee, undefined);

    // Et le compte repart de l'attente courte, pas de là où il s'était arrêté.
    const repris = noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    assert.strictEqual(repris.echecsDAffilee, 1);
  });

  it("l'attente GRANDIT vraiment au fil des INCIDENTS", () => {
    // La rampe reste prouvée — sur des incidents distincts, séparés par leurs
    // reprises. C'est elle qui protège du compte définitivement cassé dont
    // l'erreur ressemble à un hoquet : sans elle, il serait retenté toutes
    // les heures, à vie.
    let sante = noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    const attentes = [(Date.parse(sante.repriseA ?? "") - MAINTENANT) / 3_600_000];
    for (let incident = 0; incident < 4; incident += 1) {
      const quand = Date.parse(sante.repriseA ?? "") + 1_000;
      sante = incidentSuivant(sante);
      attentes.push((Date.parse(sante.repriseA ?? "") - quand) / 3_600_000);
    }
    assert.deepStrictEqual(attentes, [1, 1, 4, 4, 12]);
  });
});
