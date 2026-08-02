import { describe, expect, it } from "vite-plus/test";

import type { SanteCompte } from "./comptePool.ts";
import { rotationPour } from "./rotationProjection.ts";

const INSTANT = Date.parse("2026-08-02T12:00:00.000Z");
const sante = (surcharge: Partial<SanteCompte> = {}): SanteCompte =>
  ({ instanceId: "claude-a", etat: "ok", ...surcharge }) as SanteCompte;

describe("l'état de rotation envoyé au client", () => {
  it("ne dit RIEN d'un compte sain qui n'a jamais bronché", () => {
    // Envoyer « ok » pour chaque compte en bonne santé, à chaque instantané,
    // c'est du bruit qui finit par masquer le seul compte qui va mal.
    expect(rotationPour(sante(), INSTANT)).toBeUndefined();
  });

  it("parle d'un compte reparti après des hoquets", () => {
    // « Il est reparti après trois échecs » n'est pas « il n'a jamais
    // bronché ». Le second est un silence ; le premier est une information.
    const etat = rotationPour(sante({ echecsDAffilee: 3 }), INSTANT);
    expect(etat).toEqual({ state: "ok", consecutiveFailures: 3 });
  });

  it("traduit le vocabulaire du moteur, qui est en français", () => {
    expect(rotationPour(sante({ etat: "mort", raison: "jeton révoqué" }), INSTANT)).toMatchObject({
      state: "dead",
      reason: "jeton révoqué",
    });
  });

  describe("le refroidissement", () => {
    const enCours = sante({
      etat: "refroidissement",
      raison: "quota atteint",
      repriseA: "2026-08-02T13:00:00.000Z",
    });

    it("porte sa raison ET son heure de reprise tant qu'il dure", () => {
      expect(rotationPour(enCours, INSTANT)).toEqual({
        state: "cooling",
        reason: "quota atteint",
        resumesAt: "2026-08-02T13:00:00.000Z",
      });
    });

    it("redevient « ok » une fois l'heure passée, sans qu'on ait rien réécrit", () => {
      // `etatA` juge le refroidissement par rapport à l'horloge : le magasin
      // garde « refroidissement », mais l'état VU est « ok ». Sans ça, un
      // compte resterait affiché comme écarté longtemps après sa reprise.
      const apres = Date.parse("2026-08-02T13:00:01.000Z");
      expect(rotationPour(enCours, apres)).toBeUndefined();
    });

    it("ne porte PLUS l'heure de reprise une fois celle-ci dépassée", () => {
      // Annoncer une attente déjà terminée est un mensonge tranquille : la
      // ligne dirait « reprend à 13 h » alors qu'il est 13 h 30.
      const apres = Date.parse("2026-08-02T13:30:00.000Z");
      const etat = rotationPour({ ...enCours, echecsDAffilee: 2 }, apres);
      expect(etat).toEqual({ state: "ok", consecutiveFailures: 2 });
      expect(etat).not.toHaveProperty("resumesAt");
    });

    it("tient encore à la SECONDE exacte de la reprise", () => {
      // `etatA` rend « ok » quand reprise <= maintenant. À l'instant pile, le
      // compte est donc de nouveau utilisable — et la frontière mérite d'être
      // figée, parce qu'un décalage d'une seconde ici se lit comme un bug
      // intermittent.
      const pile = Date.parse("2026-08-02T13:00:00.000Z");
      expect(rotationPour(enCours, pile)).toBeUndefined();
      const justeAvant = pile - 1;
      expect(rotationPour(enCours, justeAvant)).toMatchObject({ state: "cooling" });
    });
  });

  it("ne raconte pas de raison pour un compte qui va bien", () => {
    // Une raison sans état à expliquer est un vestige : elle décrirait un
    // ennui déjà passé.
    const etat = rotationPour(sante({ raison: "hoquet réseau", echecsDAffilee: 1 }), INSTANT);
    expect(etat).toEqual({ state: "ok", consecutiveFailures: 1 });
    expect(etat).not.toHaveProperty("reason");
  });

  it("survit à une date de reprise illisible sans planter", () => {
    // `etatA` rend « ok » quand la date ne se parse pas. Mieux vaut un compte
    // utilisable qu'un compte écarté pour une donnée corrompue.
    const etat = rotationPour(
      sante({ etat: "refroidissement", repriseA: "pas-une-date" }),
      INSTANT,
    );
    expect(etat).toBeUndefined();
  });
});
