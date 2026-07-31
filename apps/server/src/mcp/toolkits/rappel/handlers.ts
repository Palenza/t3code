import * as Effect from "effect/Effect";

import {
  bornerCharge,
  bornesDeFil,
  expressionMatch,
  fenetreAutour,
  meilleurParFil,
  modeDeRappel,
  FILS_PAR_DECOUVERTE,
  tronquerMessage,
  type MessageDeFil,
  PLAFOND_ANCRE,
  PLAFOND_BORNE,
  PLAFOND_CHARGE,
  PLAFOND_VOISIN,
  RAYON_FENETRE,
  TAILLE_BORNES,
} from "../../../rappel/RappelRequete.ts";
import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { RappelStore } from "../../../rappel/RappelStore.ts";
import { RappelError, RappelToolkit } from "./tools.ts";

/**
 * Combien de messages bruts on tire de l'index avant de regrouper par fil.
 *
 * Il en faut BEAUCOUP plus que de fils voulus : un seul fil bavard peut
 * occuper les vingt premières lignes, et si on coupait à huit on ne verrait
 * jamais le neuvième fil. Chiffre de départ, pas une mesure — à recaler quand
 * l'usage dira combien de fils un terme courant touche vraiment.
 */
const TROUVAILLES_BRUTES = 120;

const FILS_RECENTS = 20;

/** Le poids d'un message dans le budget de charge : son texte, rien d'autre. */
const poidsDe = (message: MessageDeFil) => message.texte.length;

/**
 * La FENÊTRE : le message trouvé arrive entier, ses voisins écourtés. Couper
 * tout à la même longueur reviendrait à traiter la preuve comme du décor.
 */
const couperFenetre = (messages: ReadonlyArray<MessageDeFil>, ancre: string): MessageDeFil[] =>
  messages.map((message) =>
    tronquerMessage(message, message.messageId === ancre ? PLAFOND_ANCRE : PLAFOND_VOISIN),
  );

/** Les BORNES : on s'oriente, on ne relit pas. */
const couperBornes = (messages: ReadonlyArray<MessageDeFil>): MessageDeFil[] =>
  messages.map((message) => tronquerMessage(message, PLAFOND_BORNE));

/**
 * Une panne d'index ne remonte JAMAIS telle quelle.
 *
 * A7 : nos erreurs sont lues par un AGENT. « SqliteError: no such table »
 * ne lui dit rien de réparable ; « l'index n'existe pas encore » lui dit
 * quoi faire. On nomme la cause ET le geste.
 */
const erreurDIndex = (cause: unknown) =>
  new RappelError({
    message: `Le rappel n'a pas pu lire l'index des conversations (${String(cause)}). Cet index est posé par la migration 036 : si le serveur vient d'être mis à jour, relance-le pour qu'elle s'applique.`,
  });

const handlers = {
  rappel: (input) =>
    // LA PORTE EST À LA SORTIE DU GESTIONNAIRE, pas à chaque `return`.
    // Ma première version l'avait posée sur un seul des quatre retours : une
    // porte qu'on peut contourner par un chemin d'erreur ou un mode moins
    // fréquent ne protège rien. Ici, TOUT ce que l'outil rend passe par elle.
    Effect.flatMap(
      Effect.gen(function* () {
        const store = yield* RappelStore;
        const mode = modeDeRappel(input);

        if (mode === "parcours") {
          const recents = yield* store
            .filsRecents(FILS_RECENTS)
            .pipe(Effect.mapError(erreurDIndex));
          return {
            mode,
            fils: [],
            fenetre: [],
            recents,
            note:
              recents.length === 0
                ? "Aucun fil enregistré."
                : `${recents.length} fils récents. Donne une \`question\` pour chercher dedans, ou \`filId\`+\`autourDe\` pour défiler.`,
          };
        }

        if (mode === "defilement") {
          const filId = input.filId ?? "";
          const ancre = input.autourDe ?? "";
          const messages = yield* store.messagesDuFil(filId).pipe(Effect.mapError(erreurDIndex));
          if (messages.length === 0) {
            // Les erreurs sont lues par un AGENT (A7) : on nomme ce qui a été
            // demandé, pas juste « introuvable ».
            return yield* new RappelError({
              message: `Aucun message dans le fil « ${filId} ». Vérifie l'identifiant, ou appelle \`rappel\` sans argument pour lister les fils.`,
            });
          }
          const fenetreBrute = fenetreAutour(messages, ancre, RAYON_FENETRE);
          // En défilement, il n'y a pas de « trouvaille » : l'ancre EST ce qu'on
          // vient lire, elle arrive entière, le reste écourté.
          const fenetre = couperFenetre(fenetreBrute, ancre);
          if (fenetre.length === 0) {
            return yield* new RappelError({
              message: `Le message « ${ancre} » n'est pas dans le fil « ${filId} » (${messages.length} messages). Réancre-toi sur un identifiant rendu par un appel précédent.`,
            });
          }
          return {
            mode,
            fils: [],
            fenetre,
            recents: [],
            note: `Fenêtre de ${fenetre.length} messages. Pour continuer, réancre sur « ${fenetre[0]?.messageId ?? ancre} » (vers le haut) ou « ${fenetre[fenetre.length - 1]?.messageId ?? ancre} » (vers le bas).`,
          };
        }

        const question = input.question ?? "";
        const expression = expressionMatch(question);
        if (expression === null) {
          return yield* new RappelError({
            message: `« ${question} » ne contient aucun mot cherchable. Donne au moins un mot (lettres ou chiffres).`,
          });
        }

        const brutes = yield* store
          .chercher(expression, TROUVAILLES_BRUTES)
          .pipe(Effect.mapError(erreurDIndex));
        const retenues = meilleurParFil(brutes, FILS_PAR_DECOUVERTE);
        if (retenues.length === 0) {
          return {
            mode,
            fils: [],
            fenetre: [],
            recents: [],
            // H4 : « on n'a pas trouvé » est un fait sur NOUS, pas une
            // affirmation sur le monde. Le sujet a pu être abordé avec d'autres
            // mots, ou avant que l'index existe.
            note: `On n'a rien trouvé pour « ${question} » dans les conversations indexées. Essaie d'autres mots — l'index cherche des mots entiers, pas des préfixes.`,
          };
        }

        const recents = yield* store
          .filsRecents(FILS_RECENTS * 5)
          .pipe(Effect.mapError(erreurDIndex));
        const titres = new Map(recents.map((fil) => [fil.filId, fil.titre]));

        const filsComplets = yield* Effect.forEach(retenues, (trouvaille) =>
          Effect.gen(function* () {
            const messages = yield* store
              .messagesDuFil(trouvaille.filId)
              .pipe(Effect.mapError(erreurDIndex));
            const bornes = bornesDeFil(messages, TAILLE_BORNES);
            return {
              filId: trouvaille.filId,
              titre: titres.get(trouvaille.filId) ?? "(sans titre)",
              archive: trouvaille.filArchive,
              ancre: trouvaille.messageId,
              fenetre: couperFenetre(
                fenetreAutour(messages, trouvaille.messageId, RAYON_FENETRE),
                trouvaille.messageId,
              ),
              debutDuFil: couperBornes(bornes.debut),
              finDuFil: couperBornes(bornes.fin),
            };
          }),
        );

        // LE BUDGET GLOBAL. Sans lui, huit fils bavards rendaient 258 000
        // jetons — un quart de la fenêtre, avalé par un outil censé en FAIRE
        // GAGNER (mesuré sur la base réelle avant de poser la limite). Les fils
        // arrivent déjà du meilleur au pire : couper par la fin retire les moins
        // pertinents.
        const bornee = bornerCharge(
          filsComplets,
          (fil) =>
            [...fil.fenetre, ...fil.debutDuFil, ...fil.finDuFil].reduce(
              (somme, message) => somme + poidsDe(message),
              0,
            ),
          PLAFOND_CHARGE,
        );
        const fils = bornee.retenus;

        return {
          mode,
          fils,
          fenetre: [],
          recents: [],
          // Aucun plafond en silence (A7) : ce qui a été écarté se dit, avec
          // sa raison et le geste pour aller le chercher.
          note: `${fils.length} fils touchés par « ${question} » (sur ${brutes.length} messages trouvés).${bornee.ecartes > 0 ? ` ${bornee.ecartes} fils écartés faute de place (budget ${PLAFOND_CHARGE} caractères) — affine la question pour les voir.` : ""} Pour lire plus loin dans un fil, rappelle avec son \`filId\` et un \`autourDe\`.`,
        };
      }),
      porteDeSortie,
    ),
} satisfies Parameters<typeof RappelToolkit.toLayer>[0];

export const RappelToolkitHandlersLive = RappelToolkit.toLayer(handlers);
