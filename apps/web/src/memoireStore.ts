import { create } from "zustand";
import { persist } from "zustand/middleware";

import { extraireConsignes, type Consigne } from "@t3tools/shared/consignes";

import { resolvePrimaryEnvironmentHttpUrl } from "./environments/primary";

/**
 * La mémoire des consignes — capture côté client, réinjection côté serveur.
 *
 * La capture vit ici parce que c'est ici que les messages de l'humain existent
 * en entier. Le serveur, lui, sait où écrire pour que la CLI relise tout ça au
 * démarrage suivant.
 *
 * Persisté : c'est tout l'intérêt. Une consigne qui meurt avec l'onglet ne
 * vaut rien — c'est le défaut qu'on corrige.
 */

const MEMOIRE_PATH = "/api/memoire";

export interface ConsigneRetenue extends Consigne {
  /** Clé stable : la phrase elle-même, on ne retient pas deux fois la même. */
  readonly id: string;
  readonly diteA: string;
}

interface MemoireState {
  consignes: ConsigneRetenue[];
  /**
   * Ce que l'humain a explicitement retiré — pierres tombales. Sans elles,
   * une consigne oubliée serait re-capturée à la prochaine occurrence de la
   * même phrase, et la décision de l'humain serait défaite en silence.
   */
  oubliees: string[];
  /** Lit un message humain et retient ce qu'il pose comme règle. */
  noterDepuisMessage: (input: { message: string; maintenant: string }) => void;
  /** L'humain retire une consigne — il peut toujours changer d'avis. */
  oublier: (id: string) => void;
}

export const useMemoireStore = create<MemoireState>()(
  persist(
    (set) => ({
      consignes: [],
      oubliees: [],
      noterDepuisMessage: ({ message, maintenant }) =>
        set((state) => {
          const nouvelles = extraireConsignes(message)
            .filter((consigne) => !state.consignes.some((c) => c.id === consigne.phrase))
            .filter((consigne) => !state.oubliees.includes(consigne.phrase))
            .map((consigne) => ({ ...consigne, id: consigne.phrase, diteA: maintenant }));
          if (nouvelles.length === 0) return state;
          const consignes = [...nouvelles, ...state.consignes];
          // Écrit dès la capture, pas au prochain démarrage : une consigne
          // donnée maintenant doit valoir dès la session suivante, même si
          // l'application est fermée brutalement entre-temps.
          void pousserAuServeur(consignes);
          return { consignes };
        }),
      oublier: (id) =>
        set((state) => {
          const consignes = state.consignes.filter((consigne) => consigne.id !== id);
          void pousserAuServeur(consignes);
          return { consignes, oubliees: [id, ...state.oubliees].slice(0, 200) };
        }),
    }),
    { name: "t3code:memoire:v2" },
  ),
);

/** Envoie la mémoire au serveur, qui l'écrit là où la CLI la relira. */
async function pousserAuServeur(consignes: ReadonlyArray<ConsigneRetenue>): Promise<void> {
  try {
    await fetch(resolvePrimaryEnvironmentHttpUrl(MEMOIRE_PATH), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        consignes: consignes.map(({ phrase, nature }) => ({ phrase, nature })),
      }),
    });
  } catch {
    // Serveur local absent : la consigne reste retenue ici et repartira à la
    // prochaine capture. On ne perd rien, on retarde.
  }
}
