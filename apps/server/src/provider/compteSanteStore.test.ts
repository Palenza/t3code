import type { ProviderInstanceId } from "@t3tools/contracts";
import { assert, beforeEach, describe, it } from "vite-plus/test";

import { classerEchec } from "./comptePool.ts";
import {
  comptesUtilisables,
  noterEchec,
  noterSucces,
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

  const hoquet = () =>
    classerEchec({ code: 500, message: "upstream hiccup", maintenant: MAINTENANT });

  it("survit d'un échec à l'autre, même quand l'écran ne change pas", () => {
    // Le registre ne PRÉVIENT les abonnés que si l'état visible bouge — sinon
    // trois échecs pendant un refroidissement repeindraient l'interface trois
    // fois. Le piège : cette économie d'affichage jetait aussi le compteur, et
    // l'attente ne grandissait jamais.
    noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    const apres = noterEchec(id("A"), hoquet(), "500", MAINTENANT);
    assert.strictEqual(apres.echecsDAffilee, 3);
    assert.strictEqual(santeDe(id("A")).echecsDAffilee, 3);
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

  it("l'attente GRANDIT vraiment au fil des échecs", () => {
    const heures = (iso: string | undefined) => (Date.parse(iso ?? "") - MAINTENANT) / 3_600_000;
    const attentes = [1, 2, 3, 4, 5].map(() =>
      heures(noterEchec(id("A"), hoquet(), "500", MAINTENANT).repriseA),
    );
    assert.deepStrictEqual(attentes, [1, 1, 4, 4, 12]);
  });
});
