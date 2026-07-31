import { assert, describe, it } from "@effect/vitest";

import type { ServerProviderRateLimitWindow } from "@t3tools/contracts";

import type { SanteCompte } from "../../../provider/comptePool.ts";
import { enCompteObserve } from "./handlers.ts";

const compte = (etat: SanteCompte["etat"]): SanteCompte =>
  ({ instanceId: "compte-a", etat }) as SanteCompte;

const fenetre = (kind: string, utilization?: number): ServerProviderRateLimitWindow =>
  ({
    kind,
    ...(utilization === undefined ? {} : { utilization }),
  }) as ServerProviderRateLimitWindow;

describe("des stores de T3 vers ce que le doctor sait lire", () => {
  it("« refroidissement » se dit « refroidit » — deux mots pour un état, un seul sens", () => {
    assert.equal(enCompteObserve(compte("refroidissement"), []).sante, "refroidit");
    assert.equal(enCompteObserve(compte("ok"), []).sante, "ok");
    assert.equal(enCompteObserve(compte("mort"), []).sante, "mort");
  });

  it("« mort » VAUT authentification expirée — l'équivalence est exacte", () => {
    // `appliquerEchec` ne pose « mort » que sur `authentification-morte` ;
    // un quota donne « refroidissement ». Si ça change un jour, ce test tombe
    // avant que le doctor ne propose de se réauthentifier pour un quota plein.
    assert.isTrue(enCompteObserve(compte("mort"), []).authExpiree);
    assert.isFalse(enCompteObserve(compte("refroidissement"), []).authExpiree);
    assert.isFalse(enCompteObserve(compte("ok"), []).authExpiree);
  });

  it("lit les deux fenêtres par leur nom", () => {
    const observe = enCompteObserve(compte("ok"), [
      fenetre("five_hour", 12),
      fenetre("seven_day", 95),
    ]);
    assert.equal(observe.cinqHeures, 12);
    assert.equal(observe.septJours, 95);
  });

  it("une fenêtre SANS pourcentage rend null, jamais 0", () => {
    // Le SDK type `utilization?: number`, et un vrai tour sur un abonnement Max
    // n'en a envoyé aucun. Zéro voudrait dire « compte intact » — l'exact
    // contraire de « on ne sait pas », et le doctor se tairait à tort.
    const observe = enCompteObserve(compte("ok"), [fenetre("seven_day")]);
    assert.isNull(observe.septJours);
    assert.isNull(observe.cinqHeures);
  });

  it("aucune fenêtre du tout : on ne sait rien, et on le dit en null", () => {
    const observe = enCompteObserve(compte("ok"), []);
    assert.isNull(observe.cinqHeures);
    assert.isNull(observe.septJours);
  });

  it("une fenêtre inconnue n'est pas prise pour l'une des deux", () => {
    const observe = enCompteObserve(compte("ok"), [fenetre("monthly", 80)]);
    assert.isNull(observe.cinqHeures);
    assert.isNull(observe.septJours);
  });
});
