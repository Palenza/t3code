import * as Effect from "effect/Effect";

import {
  bornesDeFil,
  expressionMatch,
  fenetreAutour,
  meilleurParFil,
  modeDeRappel,
  FILS_PAR_DECOUVERTE,
  RAYON_FENETRE,
  TAILLE_BORNES,
} from "../../../rappel/RappelRequete.ts";
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
    Effect.gen(function* () {
      const store = yield* RappelStore;
      const mode = modeDeRappel(input);

      if (mode === "parcours") {
        const recents = yield* store.filsRecents(FILS_RECENTS).pipe(Effect.mapError(erreurDIndex));
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
        const fenetre = fenetreAutour(messages, ancre, RAYON_FENETRE);
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

      const fils = yield* Effect.forEach(retenues, (trouvaille) =>
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
            fenetre: fenetreAutour(messages, trouvaille.messageId, RAYON_FENETRE),
            debutDuFil: bornes.debut,
            finDuFil: bornes.fin,
          };
        }),
      );

      return {
        mode,
        fils,
        fenetre: [],
        recents: [],
        note: `${fils.length} fils touchés par « ${question} » (sur ${brutes.length} messages trouvés). Pour lire plus loin dans un fil, rappelle avec son \`filId\` et un \`autourDe\`.`,
      };
    }),
} satisfies Parameters<typeof RappelToolkit.toLayer>[0];

export const RappelToolkitHandlersLive = RappelToolkit.toLayer(handlers);
