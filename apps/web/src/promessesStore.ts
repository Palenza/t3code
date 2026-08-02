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
  /**
   * Combien de promesses le PLAFOND a jetées, depuis toujours.
   *
   * Zéro en usage normal. S'il monte, c'est que le plafond mord — et il vaut
   * mieux le SAVOIR que le découvrir en cherchant une promesse qui n'existe
   * plus. Un rappel qui s'efface sans le dire est pire que pas de rappel.
   */
  evincees: number;
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

/**
 * Le plafond de STOCKAGE. Il n'est PAS le plafond d'affichage.
 *
 * Il valait 20, et il jetait les promesses les plus ANCIENNES en silence :
 * les nouvelles entrent en tête, `slice(0, 20)` garde les vingt premières.
 * L'ironie est totale — cette fonctionnalité existe pour rattraper la
 * promesse qu'on a OUBLIÉE, et la plus ancienne est précisément celle-là.
 *
 * Mesuré sur les réponses réelles : le plafond de 20 était atteint en HUIT
 * HEURES, puis l'état restait saturé en permanence ; 3 389 promesses évincées
 * sur 27 jours, sans une trace.
 *
 * La raison d'origine était l'AFFICHAGE (« au-delà, c'est du bruit ») — et
 * elle a été réparée ailleurs depuis : le panneau est replié par défaut,
 * borné en hauteur et défilant. Le plafond de stockage ne protégeait donc
 * plus rien ; il ne restait que le broyeur.
 */
export const MAX_PROMESSES_OUVERTES = 200;

export const usePromessesStore = create<PromessesState>()(
  persist(
    (set, get) => ({
      ouvertes: [],
      barrees: [],
      messagesNotes: [],
      evincees: 0,
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
          const toutes = [...nouvelles, ...state.ouvertes];
          const gardees = toutes.slice(0, MAX_PROMESSES_OUVERTES);
          const evincees = toutes.length - gardees.length;
          return {
            ...state,
            messagesNotes,
            ouvertes: gardees,
            // FAIL-LOUD : si le plafond mord un jour, ça se COMPTE. Une
            // promesse qui disparaît sans laisser de trace est exactement la
            // panne qu'on vient de réparer, et un plafond plus haut ne fait
            // que la retarder.
            evincees: state.evincees + evincees,
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
