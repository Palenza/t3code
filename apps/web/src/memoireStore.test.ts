import { describe, expect, it, vi } from "vite-plus/test";

import { useMemoireStore } from "./memoireStore.ts";

// L'adresse du serveur se lit dans l'environnement du NAVIGATEUR ; hors de lui
// la résolution échoue, et `pousserAuServeur` avale l'échec en silence — le
// test verrait « aucun envoi » sans que le magasin soit en cause. On fige donc
// l'adresse : le sujet ici est CE QUI EST ENVOYÉ, pas où.
vi.mock("./environments/primary", () => ({
  resolvePrimaryEnvironmentHttpUrl: (chemin: string) => `http://127.0.0.1:0${chemin}`,
}));

/**
 * LE FREIN. Ces tests gardent la marche arrière de la mémoire.
 *
 * La capture est arrivée sans son contraire : `oublier()` était écrite et
 * n'avait aucun appelant, si bien qu'une phrase captée entrait dans le fichier
 * que la CLI relit à chaque démarrage, sur chacun des comptes, sans aucun geste
 * pour l'en sortir. Ce qui est vérifié ici :
 *
 *   1. retirer retire VRAIMENT (et la pierre tombale empêche la recapture) ;
 *   2. retirer la DERNIÈRE consigne envoie une liste VIDE.
 *
 * Le point 2 est le maillon fragile de toute la chaîne. Côté serveur, une
 * mémoire vide efface le bloc — comportement déjà figé dans
 * `memoireConsignes.test.ts`. Mais ce chemin ne s'ouvre que si le client
 * DAIGNE poster une liste vide. Une optimisation de bon sens (« ne poste pas
 * quand il n'y a rien à écrire ») rendrait la dernière consigne éternelle sur
 * disque, sans rien casser de visible. D'où ce test.
 */

/** Remet le magasin à zéro : persisté, il traînerait d'un test à l'autre. */
function repartirDeZero() {
  useMemoireStore.setState({ consignes: [], oubliees: [] });
}

describe("mémoire : la marche arrière", () => {
  it("oublier retire la consigne et pose sa pierre tombale", () => {
    repartirDeZero();
    useMemoireStore.getState().noterDepuisMessage({
      message: "ne fais jamais de build sans me le dire",
      maintenant: "2026-07-30T10:00:00.000Z",
    });
    const retenue = useMemoireStore.getState().consignes;
    expect(retenue).toHaveLength(1);

    useMemoireStore.getState().oublier(retenue[0]!.id);
    expect(useMemoireStore.getState().consignes).toEqual([]);
    expect(useMemoireStore.getState().oubliees).toEqual([retenue[0]!.id]);
  });

  it("une consigne oubliée ne revient pas si la phrase est redite", () => {
    repartirDeZero();
    const noter = () =>
      useMemoireStore.getState().noterDepuisMessage({
        message: "ne fais jamais de build sans me le dire",
        maintenant: "2026-07-30T10:00:00.000Z",
      });
    noter();
    useMemoireStore.getState().oublier(useMemoireStore.getState().consignes[0]!.id);
    noter();
    // Sans la pierre tombale, le retrait ne durerait qu'une phrase : l'humain
    // retirerait une règle qui reviendrait toute seule au message suivant.
    expect(useMemoireStore.getState().consignes).toEqual([]);
  });

  it("retirer la DERNIÈRE consigne poste une liste vide (sinon elle est éternelle)", async () => {
    repartirDeZero();
    const envois: Array<{ consignes: ReadonlyArray<unknown> }> = [];
    const vraiFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      envois.push(JSON.parse(String(init?.body ?? "{}")) as { consignes: ReadonlyArray<unknown> });
      return new Response("{}", { status: 200 });
    }) as typeof globalThis.fetch;

    try {
      useMemoireStore.getState().noterDepuisMessage({
        message: "ne déploie jamais le vendredi",
        maintenant: "2026-07-30T10:00:00.000Z",
      });
      useMemoireStore.getState().oublier(useMemoireStore.getState().consignes[0]!.id);
      // Les envois sont lancés sans être attendus : on laisse la boucle tourner.
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      globalThis.fetch = vraiFetch;
    }

    const dernier = envois.at(-1);
    // Le retrait doit avoir posté au serveur...
    expect(dernier).toBeDefined();
    // ...et la liste postée doit être VIDE : c'est elle qui efface le bloc.
    expect(dernier?.consignes).toEqual([]);
  });
});
