import type {
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  ServerProviderRateLimits,
} from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import type { SanteCompte } from "./comptePool.ts";
import { candidatsPourDriver, nomDuCompte } from "./comptesCandidats.ts";

const id = (valeur: string) => valeur as ProviderInstanceId;

const quotas = (pourcent: number): ServerProviderRateLimits => ({
  observedAt: "2026-07-29T21:59:00.000Z",
  windows: [{ kind: "sept-jours", utilization: pourcent }],
});

const instances = {
  compte_a: { driver: "claudeAgent", displayName: "Compte A" },
  compte_b: { driver: "claudeAgent", displayName: "Compte B" },
  compte_c: { driver: "claudeAgent", displayName: "Compte C", enabled: false },
  boite_codex: { driver: "codex", displayName: "Codex" },
} as unknown as ProviderInstanceConfigMap;

const sain = (instanceId: ProviderInstanceId): SanteCompte => ({ instanceId, etat: "ok" });

describe("assemblage des candidats", () => {
  it("ne retient que les comptes du MÊME driver", () => {
    // Relayer un tour Claude vers Codex changerait de cerveau en douce.
    const candidats = candidatsPourDriver({
      instances,
      driver: "claudeAgent",
      lireQuotas: () => undefined,
      lireSante: sain,
    });

    assert.deepStrictEqual(
      candidats.map((candidat) => candidat.instanceId),
      [id("compte_a"), id("compte_b")],
    );
  });

  it("un compte désactivé est écarté", () => {
    const candidats = candidatsPourDriver({
      instances,
      driver: "claudeAgent",
      lireQuotas: () => undefined,
      lireSante: sain,
    });

    assert.ok(!candidats.some((candidat) => candidat.instanceId === id("compte_c")));
  });

  it("un compte sans champ « activé » compte comme activé", () => {
    // C'est l'état d'un compte qu'on vient d'ajouter : l'exclure le rendrait
    // invisible au relais alors qu'il est parfaitement utilisable.
    const neuf = { tout_neuf: { driver: "claudeAgent" } } as unknown as ProviderInstanceConfigMap;
    const candidats = candidatsPourDriver({
      instances: neuf,
      driver: "claudeAgent",
      lireQuotas: () => undefined,
      lireSante: sain,
    });

    assert.strictEqual(candidats.length, 1);
  });

  it("porte les quotas et la santé lus ailleurs, sans rien recompter", () => {
    const candidats = candidatsPourDriver({
      instances,
      driver: "claudeAgent",
      lireQuotas: (instanceId) => (instanceId === id("compte_a") ? quotas(94) : quotas(26)),
      lireSante: (instanceId) =>
        instanceId === id("compte_a")
          ? { instanceId, etat: "refroidissement", repriseA: "2026-07-30T02:00:00.000Z" }
          : { instanceId, etat: "ok" },
    });

    const [a, b] = candidats;
    assert.strictEqual(a?.sante.etat, "refroidissement");
    assert.strictEqual(a?.quotas?.windows[0]?.utilization, 94);
    assert.strictEqual(b?.sante.etat, "ok");
    assert.strictEqual(b?.quotas?.windows[0]?.utilization, 26);
  });

  it("aucun compte du driver : liste vide, pas une erreur", () => {
    const candidats = candidatsPourDriver({
      instances,
      driver: "un_driver_inconnu",
      lireQuotas: () => undefined,
      lireSante: sain,
    });

    assert.deepStrictEqual(candidats, []);
  });

  it("le nom affiché prime sur l'identifiant technique", () => {
    // Un identifiant dans une notification n'apprend rien à personne.
    assert.strictEqual(nomDuCompte(instances, id("compte_b")), "Compte B");
    assert.strictEqual(nomDuCompte(instances, id("inconnu")), "inconnu");
  });
});
