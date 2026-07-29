import type { ProviderInstanceId, ServerProviderRateLimits } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  appliquerEchec,
  chargeDe,
  choisir,
  classerEchec,
  etatA,
  type Candidat,
  type SanteCompte,
} from "./comptePool.ts";

const MAINTENANT = Date.parse("2026-07-29T22:00:00.000Z");
const id = (valeur: string) => valeur as ProviderInstanceId;
const sain = (valeur: string): SanteCompte => ({ instanceId: id(valeur), etat: "ok" });

const quotas = (...pourcents: ReadonlyArray<number>): ServerProviderRateLimits => ({
  observedAt: "2026-07-29T21:59:00.000Z",
  windows: pourcents.map((utilization, index) => ({
    kind: `fenetre-${index}`,
    utilization,
  })),
});

describe("classement des échecs", () => {
  it("un jeton révoqué est MORT, pas en refroidissement", () => {
    // Le remettre en rotation brûlerait un essai à chaque tour, pour toujours.
    for (const message of [
      "OAuth error: token_revoked",
      "invalid_grant: refresh token rejected",
      "Your authentication token has been invalidated.",
      "refresh_token_reused by another process",
    ]) {
      const verdict = classerEchec({ code: 401, message, maintenant: MAINTENANT });
      assert.strictEqual(verdict.nature, "authentification-morte", message);
      assert.strictEqual(verdict.repriseA, undefined, "un mort n'a pas d'heure de reprise");
    }
  });

  it("une requête invalide n'est la faute d'AUCUN compte", () => {
    // Sans ce cas, un 400 brûlerait les trois comptes pour la même erreur.
    const verdict = classerEchec({
      code: 400,
      message: "messages: field required",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "notre-faute");
  });

  it("un quota atteint refroidit une heure", () => {
    const verdict = classerEchec({
      code: 429,
      message: "rate limit exceeded",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "quota");
    assert.strictEqual(verdict.repriseA, "2026-07-29T23:00:00.000Z");
  });

  it("un 401 sans cause mortelle refroidit cinq minutes, pas une heure", () => {
    // Souvent un jeton en cours de rafraîchissement : une installation à un
    // seul compte doit pouvoir s'en remettre sans attendre une heure.
    const verdict = classerEchec({ code: 401, message: "unauthorized", maintenant: MAINTENANT });
    assert.strictEqual(verdict.nature, "transitoire");
    assert.strictEqual(verdict.repriseA, "2026-07-29T22:05:00.000Z");
  });

  it("l'heure annoncée par le fournisseur écrase notre estimation", () => {
    const verdict = classerEchec({
      code: 429,
      message: "usage limit reached",
      repriseAnnoncee: "2026-07-30T04:30:00.000Z",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.repriseA, "2026-07-30T04:30:00.000Z");
  });

  it("le refus en TEXTE de la CLI est reconnu, sans aucun code HTTP", () => {
    // Le cas vérifié en vrai le 29/07 : le refus arrive en texte d'assistant,
    // sans événement machine. C'est exactement là que le relais doit marcher.
    const verdict = classerEchec({
      message: "You've hit your session limit · resets 12:50pm",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "quota");
  });
});

describe("santé d'un compte", () => {
  it("un refroidissement expiré redevient utilisable tout seul", () => {
    const sante: SanteCompte = {
      instanceId: id("A"),
      etat: "refroidissement",
      repriseA: "2026-07-29T21:00:00.000Z",
    };
    assert.strictEqual(etatA(sante, MAINTENANT), "ok");
  });

  it("un mort ne revient JAMAIS de lui-même", () => {
    const mort: SanteCompte = { instanceId: id("A"), etat: "mort" };
    assert.strictEqual(etatA(mort, MAINTENANT + 100 * 24 * 3_600_000), "mort");
  });

  it("« notre faute » ne punit pas le compte", () => {
    const apres = appliquerEchec(sain("A"), { nature: "notre-faute" }, "400");
    assert.strictEqual(apres.etat, "ok");
  });
});

describe("choix du compte", () => {
  const candidats = (
    ...entrees: ReadonlyArray<[string, SanteCompte, ServerProviderRateLimits | undefined]>
  ): ReadonlyArray<Candidat> =>
    entrees.map(([nom, sante, mesures]) => ({
      instanceId: id(nom),
      sante,
      quotas: mesures,
    }));

  it("vide les comptes qui dorment avant celui qui étouffe", () => {
    // L'état réel du 29/07 : A à 94 %, B à 26 %, C à 37 %.
    const choisi = choisir({
      candidats: candidats(
        ["A", sain("A"), quotas(0, 94)],
        ["B", sain("B"), quotas(0, 26)],
        ["C", sain("C"), quotas(27, 37)],
      ),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });

  it("c'est la fenêtre la PLUS entamée qui décide, pas la moyenne", () => {
    // A a une moyenne plus basse, mais une fenêtre à 99 % : c'est elle qui
    // le fera tomber au prochain tour.
    assert.strictEqual(chargeDe(quotas(0, 0, 99)), 99);
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), quotas(0, 0, 99)], ["B", sain("B"), quotas(40, 40)]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });

  it("un compte déjà tenté dans ce tour n'est pas rejoué", () => {
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), quotas(10)], ["B", sain("B"), quotas(80)]),
      strategie: "moins-charge",
      dejaTentes: new Set([id("A")]),
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });

  it("morts et refroidis sont écartés", () => {
    const choisi = choisir({
      candidats: candidats(
        ["A", { instanceId: id("A"), etat: "mort" }, quotas(0)],
        [
          "B",
          { instanceId: id("B"), etat: "refroidissement", repriseA: "2026-07-30T02:00:00.000Z" },
          quotas(0),
        ],
        ["C", sain("C"), quotas(88)],
      ),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("C"));
  });

  it("plus rien de disponible renvoie null — à DIRE, jamais à masquer", () => {
    const choisi = choisir({
      candidats: candidats(["A", { instanceId: id("A"), etat: "mort" }, undefined]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi, null);
  });

  it("un compte sans mesure n'est pas condamné à ne jamais servir", () => {
    // Sans mesure = rien de consommé qu'on sache. Le compter comme chargé
    // l'exclurait définitivement, y compris au tout premier démarrage.
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), quotas(50)], ["B", sain("B"), undefined]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });
  it("un compte que le fournisseur a REJETÉ n'est jamais le préféré, même sans pourcentage", () => {
    // Cas réel du 28/07 : la fenêtre « rejected » arrive SANS utilization —
    // elle scorait 0 et devenait le compte le moins chargé du relais.
    const rejeteSansMesure: ServerProviderRateLimits = {
      observedAt: "2026-07-29T21:59:00.000Z",
      windows: [{ kind: "seven_day", severity: "rejected" }],
    };
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), rejeteSansMesure], ["B", sain("B"), quotas(96)]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"), "le compte sain à 96 % passe avant le rejeté");
  });

  it("quand il ne reste QUE des rejetés, on tente quand même — jamais d'abandon muet", () => {
    const rejete: ServerProviderRateLimits = {
      observedAt: "2026-07-29T21:59:00.000Z",
      windows: [{ kind: "seven_day", severity: "rejected", utilization: 94 }],
    };
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), rejete]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("A"));
  });
});
