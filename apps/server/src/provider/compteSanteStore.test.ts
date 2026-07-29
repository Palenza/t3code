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
    noterEchec(id("A"), quotaAtteint(), "usage limit reached");

    const sante = santeDe(id("A"));
    assert.strictEqual(sante.etat, "refroidissement");
    assert.strictEqual(sante.repriseA, "2026-07-29T23:00:00.000Z");
    assert.deepStrictEqual(comptesUtilisables([id("A"), id("B")], MAINTENANT), [id("B")]);
  });

  it("le refroidissement se lève tout seul à l'heure dite", () => {
    noterEchec(id("A"), quotaAtteint(), "usage limit reached");

    const uneHeureApres = MAINTENANT + 3_600_000;
    assert.deepStrictEqual(comptesUtilisables([id("A")], uneHeureApres), [id("A")]);
  });

  it("un jeton révoqué ne revient jamais, même dans cent jours", () => {
    noterEchec(id("A"), jetonRevoque(), "token_revoked");

    assert.strictEqual(santeDe(id("A")).etat, "mort");
    assert.deepStrictEqual(comptesUtilisables([id("A")], MAINTENANT + 100 * 86_400_000), []);
  });

  it("une réussite répare un compte marqué mort à tort", () => {
    // La seule preuve qui vaut : si un tour passe, le compte est bon, quoi
    // qu'on ait déduit d'un message d'erreur mal formulé.
    noterEchec(id("A"), jetonRevoque(), "token_revoked");
    noterSucces(id("A"));

    assert.strictEqual(santeDe(id("A")).etat, "ok");
  });

  it("n'ameute les abonnés que quand l'état bouge vraiment", () => {
    let tics = 0;
    const stop = surChangementDeSante(() => {
      tics += 1;
    });

    noterEchec(id("A"), quotaAtteint(), "usage limit reached");
    // Trois échecs de plus pendant le même refroidissement : rien n'a changé,
    // l'interface ne doit pas se repeindre trois fois.
    noterEchec(id("A"), quotaAtteint(), "usage limit reached");
    noterEchec(id("A"), quotaAtteint(), "usage limit reached");
    noterEchec(id("A"), quotaAtteint(), "usage limit reached");

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
    noterEchec(id("A"), verdict, "requête invalide");

    assert.strictEqual(santeDe(id("A")).etat, "ok");
    assert.deepStrictEqual(comptesUtilisables([id("A")], MAINTENANT), [id("A")]);
  });
});
