import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  abonnerALaFermeture,
  fermetureLevee,
  leverLaFermeture,
  reinitialiserFermetureEnCours,
} from "./fermetureEnCours";

describe("fermetureEnCours", () => {
  beforeEach(() => {
    reinitialiserFermetureEnCours();
    // Dans un navigateur, `window` EST `globalThis` : poser le pont sur
    // `globalThis` revient exactement à ce que fait le preload.
    (globalThis as { window?: unknown }).window = globalThis;
    delete (globalThis as { desktopBridge?: unknown }).desktopBridge;
  });

  it("prévient les abonnés, une seule fois, et ne redescend jamais", () => {
    let compte = 0;
    abonnerALaFermeture(() => {
      compte += 1;
    });

    expect(fermetureLevee()).toBe(false);
    leverLaFermeture();
    expect(fermetureLevee()).toBe(true);
    expect(compte).toBe(1);

    // Une fermeture ne s'annule pas : un second signal ne réveille personne,
    // et le drapeau reste levé. Sans cette idempotence, un `useSyncExternal
    // Store` re-rendrait à chaque évènement pendant toute la fermeture.
    leverLaFermeture();
    expect(compte).toBe(1);
    expect(fermetureLevee()).toBe(true);
  });

  it("ne branche le pont qu'UNE fois, quel que soit le nombre d'abonnés", () => {
    let branchements = 0;
    (globalThis as { desktopBridge?: unknown }).desktopBridge = {
      onAppQuitting: () => {
        branchements += 1;
        return () => {};
      },
    };

    abonnerALaFermeture(() => {});
    abonnerALaFermeture(() => {});
    abonnerALaFermeture(() => {});
    expect(branchements).toBe(1);
  });

  it("laisse le pont lever le drapeau", () => {
    // Typage explicite : TypeScript ne voit pas que le rappel s'exécute et
    // réduirait la variable à `never`.
    let annoncer: null | (() => void) = null;
    const poser = (listener: () => void) => {
      annoncer = listener;
    };
    (globalThis as { desktopBridge?: unknown }).desktopBridge = {
      onAppQuitting: (listener: () => void) => {
        poser(listener);
        return () => {};
      },
    };

    let prevenu = false;
    abonnerALaFermeture(() => {
      prevenu = true;
    });
    expect(fermetureLevee()).toBe(false);

    // C'est le processus principal qui parle, pas une devinette du rendu.
    if (annoncer === null) throw new Error("le pont n'a pas reçu d'écouteur");
    (annoncer as () => void)();
    expect(fermetureLevee()).toBe(true);
    expect(prevenu).toBe(true);
  });

  it("ne jette pas quand il n'y a pas de pont de bureau", () => {
    // Le cas navigateur : `window.desktopBridge` est absent. Le module doit
    // rester muet plutôt qu'exploser au premier rendu.
    expect(() => abonnerALaFermeture(() => {})).not.toThrow();
    expect(fermetureLevee()).toBe(false);
  });

  it("désabonne proprement", () => {
    let compte = 0;
    const desabonner = abonnerALaFermeture(() => {
      compte += 1;
    });
    desabonner();
    leverLaFermeture();
    expect(compte).toBe(0);
    // Le drapeau, lui, se lève quand même : il est global, pas par abonné.
    expect(fermetureLevee()).toBe(true);
  });
});
