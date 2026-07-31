import type {
  ModelSelection,
  ProviderInstanceId,
  ServerProviderRateLimits,
} from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import type { Candidat, SanteCompte } from "./comptePool.ts";
import { deciderRelais } from "./relaisDecision.ts";

const MAINTENANT = Date.parse("2026-07-29T22:00:00.000Z");
const id = (valeur: string) => valeur as ProviderInstanceId;

const quotas = (...pourcents: ReadonlyArray<number>): ServerProviderRateLimits => ({
  observedAt: "2026-07-29T21:59:00.000Z",
  windows: pourcents.map((utilization, index) => ({ kind: `f-${index}`, utilization })),
});

const sain = (valeur: string): SanteCompte => ({ instanceId: id(valeur), etat: "ok" });

const candidat = (nom: string, charge: number, sante: SanteCompte = sain(nom)): Candidat => ({
  instanceId: id(nom),
  sante,
  quotas: quotas(charge),
});

const selection: ModelSelection = {
  instanceId: id("A"),
  model: "claude-opus-5",
} as ModelSelection;

const base = {
  compteMort: id("A"),
  selectionActuelle: selection,
  dejaTentes: new Set<ProviderInstanceId>(),
  strategie: "moins-charge" as const,
  maintenant: MAINTENANT,
};

describe("décision de relais", () => {
  it("quota atteint : reprend sur le compte le moins chargé, MÊME modèle", () => {
    const decision = deciderRelais({
      ...base,
      code: 429,
      message: "usage limit reached",
      candidats: [candidat("A", 100), candidat("B", 26), candidat("C", 37)],
    });

    assert.strictEqual(decision.type, "basculer");
    if (decision.type !== "basculer") return;
    assert.strictEqual(decision.vers, id("B"));
    // Changer de compte, pas de cerveau : un tour relancé sur un autre
    // modèle ne serait plus le tour demandé.
    assert.strictEqual(decision.modelSelection.model, "claude-opus-5");
    assert.strictEqual(decision.modelSelection.instanceId, id("B"));
  });

  it("requête invalide : on ne bascule PAS — la faute suivrait", () => {
    const decision = deciderRelais({
      ...base,
      code: 400,
      message: "messages: field required",
      candidats: [candidat("A", 0), candidat("B", 0)],
    });

    assert.strictEqual(decision.type, "laisser");
  });

  it("le compte mort n'est jamais rejoué sur lui-même", () => {
    // Même s'il est le moins chargé de tous et que l'appelant a oublié de
    // le déclarer comme déjà tenté.
    const decision = deciderRelais({
      ...base,
      code: 429,
      message: "usage limit reached",
      candidats: [candidat("A", 0), candidat("B", 90)],
    });

    assert.strictEqual(decision.type, "basculer");
    if (decision.type !== "basculer") return;
    assert.strictEqual(decision.vers, id("B"));
  });

  it("plus aucun compte : ÉPUISÉ, avec la raison, jamais en silence", () => {
    const decision = deciderRelais({
      ...base,
      code: 429,
      message: "usage limit reached",
      candidats: [
        candidat("A", 100),
        candidat("B", 0, {
          instanceId: id("B"),
          etat: "refroidissement",
          repriseA: "2026-07-30T02:00:00.000Z",
        }),
        candidat("C", 0, { instanceId: id("C"), etat: "mort" }),
      ],
    });

    assert.strictEqual(decision.type, "epuise");
    if (decision.type !== "epuise") return;
    assert.match(decision.raison, /à sec|reprise/);
  });

  it("jeton révoqué : reprend ailleurs et le dit sans parler de quota", () => {
    const decision = deciderRelais({
      ...base,
      code: 401,
      message: "token_revoked",
      candidats: [candidat("A", 0), candidat("B", 10)],
    });

    assert.strictEqual(decision.type, "basculer");
    if (decision.type !== "basculer") return;
    assert.strictEqual(decision.vers, id("B"));
    assert.match(decision.raison, /authentifié/);
  });

  it("un compte déjà tenté dans ce tour n'est pas repris une seconde fois", () => {
    const decision = deciderRelais({
      ...base,
      code: 429,
      message: "usage limit reached",
      dejaTentes: new Set([id("B")]),
      candidats: [candidat("A", 100), candidat("B", 5), candidat("C", 60)],
    });

    assert.strictEqual(decision.type, "basculer");
    if (decision.type !== "basculer") return;
    assert.strictEqual(decision.vers, id("C"));
  });

  it("le refus en TEXTE brut de la CLI déclenche le relais", () => {
    // Le cas réel du 29/07 : pas de code HTTP, pas d'événement machine —
    // juste une phrase dans la réponse. C'est là que le relais doit servir.
    const decision = deciderRelais({
      ...base,
      message: "You've hit your session limit · resets 12:50pm (Asia/Makassar)",
      candidats: [candidat("A", 100), candidat("B", 30)],
    });

    assert.strictEqual(decision.type, "basculer");
    if (decision.type !== "basculer") return;
    assert.strictEqual(decision.vers, id("B"));
  });

  it("un seul compte au monde : épuisé, pas de bascule imaginaire", () => {
    const decision = deciderRelais({
      ...base,
      code: 429,
      message: "usage limit reached",
      candidats: [candidat("A", 100)],
    });

    assert.strictEqual(decision.type, "epuise");
  });
});

describe("les échecs qu'une bascule ne répare PAS", () => {
  const socle = { ...base, candidats: [candidat("A", 10), candidat("B", 10)] };

  it("un CONTEXTE PLEIN ne bascule pas — un autre compte a la même fenêtre", () => {
    // Aspiré d'Hermès : leur taxonomie sépare `context_overflow` du reste
    // précisément parce que le remède est de COMPRESSER, pas de basculer.
    const d = deciderRelais({
      ...socle,
      code: 400,
      message: "prompt is too long: 1050000 tokens > 1000000 maximum",
    });
    assert.equal(d.type, "laisser");
    assert.equal(d.verdict.nature, "contexte-trop-grand");
    assert.include(d.raison, "COMPRESSER");
  });

  it("une SURCHARGE du fournisseur ne bascule pas — elle les touche tous", () => {
    // Sans cette règle, un 529 d'Anthropic partait en « transitoire » et
    // brûlait le tour d'un second compte Max pour le même échec.
    const d = deciderRelais({
      ...socle,
      code: 529,
      message: "Overloaded: the service is temporarily overloaded",
    });
    assert.equal(d.type, "laisser");
    assert.equal(d.verdict.nature, "surcharge-fournisseur");
    assert.include(d.raison, "débordé");
  });

  it("un vrai QUOTA bascule toujours — la correction n'a rien élargi", () => {
    const d = deciderRelais({ ...socle, code: 429, message: "rate limit exceeded" });
    assert.equal(d.type, "basculer");
  });

  it("un 5xx ordinaire bascule toujours", () => {
    const d = deciderRelais({ ...socle, code: 502, message: "bad gateway" });
    assert.equal(d.type, "basculer");
  });
});
