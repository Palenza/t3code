import { create } from "zustand";
import { persist } from "zustand/middleware";

import { extrairePromesses, promesseTenue } from "@t3tools/shared/promesses";

/**
 * Les promesses ouvertes — ce que l'agent a dit qu'il ferait et qui ne l'est
 * pas encore.
 *
 * Persisté volontairement, contrairement au registre de santé des comptes : une
 * promesse ne meurt pas parce qu'on a fermé l'application. C'est même le cas
 * qui compte le plus — celui où l'humain revient le lendemain et se demande où
 * en était le travail.
 *
 * Une promesse se ferme de deux façons : le travail qui la tient apparaît (les
 * fichiers touchés, les commits), ou l'humain la barre lui-même. Elle ne se
 * ferme JAMAIS toute seule avec le temps : une promesse qui s'efface après
 * quelques jours est exactement le défaut qu'on cherche à corriger.
 */

export interface PromesseOuverte {
  /** Clé stable : la phrase suffit, on ne promet pas deux fois la même chose. */
  readonly id: string;
  readonly phrase: string;
  readonly action: string;
  /** Quand elle a été faite, en ISO — pour dire « il y a trois jours ». */
  readonly faiteA: string;
  /** Le fil où elle a été faite, pour y retourner d'un clic. */
  readonly threadKey: string | null;
}

interface PromessesState {
  ouvertes: PromesseOuverte[];
  /**
   * Les promesses BARRÉES par l'humain — pierres tombales. Sans elles,
   * rouvrir un vieux fil re-extrait sa dernière réponse et ressuscite ce qui
   * a été barré : la décision de l'humain serait défaite en silence.
   */
  barrees: string[];
  /**
   * Les messages déjà lus, par id — l'extraction est ÉVÉNEMENTIELLE, pas
   * dérivée de l'état : un historique rechargé ne doit jamais re-noter.
   */
  messagesNotes: string[];
  /** Lit une réponse d'agent et retient ce qu'elle engage. */
  noterDepuisReponse: (input: {
    reponse: string;
    sourceMessageId: string;
    threadKey: string | null;
    maintenant: string;
  }) => void;
  /**
   * Ferme les promesses que ce travail tient. PAS branché automatiquement, et
   * c'est un choix (audit 29/07) : le seul signal disponible côté client est
   * le texte des réponses, et fermer sur ce texte fermerait la promesse au
   * moment même où elle est faite — la phrase qui promet contient son action.
   * La fermeture attend un vrai signal de travail (commits, fichiers) ; d'ici
   * là, l'humain barre d'un clic droit.
   */
  fermerParTravail: (traces: ReadonlyArray<string>) => void;
  /** L'humain barre une promesse — son dernier mot prime toujours. */
  barrer: (id: string) => void;
  tout: () => ReadonlyArray<PromesseOuverte>;
}

/** Au-delà, ce n'est plus un rappel, c'est du bruit qu'on cesse de lire. */
export const MAX_PROMESSES_OUVERTES = 20;

export const usePromessesStore = create<PromessesState>()(
  persist(
    (set, get) => ({
      ouvertes: [],
      barrees: [],
      messagesNotes: [],
      noterDepuisReponse: ({ reponse, sourceMessageId, threadKey, maintenant }) =>
        set((state) => {
          if (state.messagesNotes.includes(sourceMessageId)) return state;
          const nouvelles = extrairePromesses(reponse)
            .filter((promesse) => !state.ouvertes.some((o) => o.id === promesse.phrase))
            .filter((promesse) => !state.barrees.includes(promesse.phrase))
            .map((promesse) => ({
              id: promesse.phrase,
              phrase: promesse.phrase,
              action: promesse.action,
              faiteA: maintenant,
              threadKey,
            }));
          // Le message est marqué lu MÊME sans promesse : le relire ne
          // coûtera plus une extraction. Plafonné pour ne pas croître à vie.
          const messagesNotes = [sourceMessageId, ...state.messagesNotes].slice(0, 400);
          if (nouvelles.length === 0) return { ...state, messagesNotes };
          return {
            ...state,
            messagesNotes,
            ouvertes: [...nouvelles, ...state.ouvertes].slice(0, MAX_PROMESSES_OUVERTES),
          };
        }),
      fermerParTravail: (traces) =>
        set((state) => ({
          ouvertes: state.ouvertes.filter(
            (promesse) =>
              !promesseTenue({ phrase: promesse.phrase, action: promesse.action }, traces),
          ),
        })),
      barrer: (id) =>
        set((state) => ({
          ouvertes: state.ouvertes.filter((promesse) => promesse.id !== id),
          // La pierre tombale : barré une fois = barré pour toujours.
          barrees: [id, ...state.barrees].slice(0, 200),
        })),
      tout: () => get().ouvertes,
    }),
    { name: "t3code:promesses:v2" },
  ),
);
