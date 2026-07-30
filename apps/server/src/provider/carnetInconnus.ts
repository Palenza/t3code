import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

/**
 * LE CARNET DES INCONNUS — ce que le système ne sait pas encore lire.
 *
 * Le classement des pannes (`comptePool.ts`) rend un verdict accompagné d'un
 * drapeau `reconnu`. Quand il vaut `false`, la nature retournée est une
 * SUPPOSITION prudente : le message n'a correspondu à aucun motif connu, et on
 * le range en « transitoire » faute de mieux. Deux pannes réelles ont traversé
 * ce classement en une seule nuit, chacune déguisée en transitoire, chacune
 * laissant un fil mort sans explication.
 *
 * Jusqu'ici ce cas produisait un `logWarning`. Un cri dans un fichier que
 * personne n'ouvre est un état INVISIBLE — précisément la forme d'échec qui
 * fait revenir les mêmes bugs. Ce module le rend observable et compté.
 *
 * ## Ce que fait ce carnet, et ce qu'il ne fait pas
 *
 * Il ne devine rien. Il ne classe rien. Il n'appelle aucun modèle. Il fait UNE
 * chose : regrouper les messages qu'on n'a pas su lire, et les compter. Le
 * jugement est un COMPTEUR — deux occurrences du même inconnu valent
 * arrêt-de-chaîne, exactement la règle qu'on s'applique à la main. C'est
 * volontaire : un juge qui interprète peut se tromper en silence, un compteur
 * non.
 *
 * ## Pourquoi il persiste, quand la santé des comptes ne persiste pas
 *
 * `compteSanteStore` oublie tout au redémarrage, et il a raison : un « mort »
 * écrit sur disque survivrait à la ré-authentification qui le guérit. Ici c'est
 * l'inverse. Un message qu'on ne sait pas lire ne devient pas lisible parce
 * qu'on a redémarré ; l'oublier, c'est repartir de zéro à chaque relance et
 * n'atteindre jamais la deuxième occurrence qui déclenche l'alarme. L'oubli
 * serait la panne.
 *
 * ## La forme
 *
 * Noyau PUR (signature, agrégation, tri) séparé de l'écorce IO. Tout ce qui
 * peut se tromper — le regroupement — se teste sans toucher un disque.
 *
 * Sur disque : un état AGRÉGÉ relu-modifié-réécrit à chaque note, jamais un
 * cache en mémoire qui pourrait diverger du fichier. Le jeu est minuscule par
 * nature — un inconnu est l'exception — et un fichier agrégé se lit à l'œil nu.
 */

/** Une entrée du carnet : un inconnu, son exemplaire, son compteur. */
export interface EntreeCarnet {
  /** La forme normalisée qui sert de clé de regroupement. */
  readonly signature: string;
  /**
   * Le message BRUT, verbatim, tel qu'il est arrivé la première fois. C'est lui
   * qu'un humain lit pour écrire le motif manquant — la signature, elle, est
   * mutilée par la normalisation et ne sert qu'à compter.
   */
  readonly exemple: string;
  readonly occurrences: number;
  readonly premiereVue: string;
  readonly derniereVue: string;
  /** Les comptes touchés : un inconnu vu partout n'est pas un compte cassé. */
  readonly comptes: ReadonlyArray<string>;
  /**
   * L'exemplaire a-t-il été COUPÉ au fil-piège ? Une limite silencieuse est
   * pire que pas de limite (A7) : sans ce drapeau, on lirait un message
   * amputé en le croyant entier, et on écrirait le mauvais motif.
   */
  readonly tronque?: boolean;
}

export interface Observation {
  readonly message: string;
  readonly compte: string;
  readonly maintenant: string;
}

/**
 * FIL-PIÈGE sur le nombre de signatures distinctes — posé là où seul un carnet
 * CASSÉ arrive, jamais un carnet sain.
 *
 * REÇU : le coût réel est la taille du fichier, réécrit à chaque note. Une
 * entrée pèse son exemplaire plus ~200 octets de métadonnées ; à 200 signatures
 * le pire cas théorique est de quelques mégaoctets, et le cas réel de quelques
 * dizaines de kilooctets — un inconnu est l'exception, pas la règle. Un carnet
 * sain vit à une poignée d'entrées : toucher ce plafond ne veut pas dire « on a
 * beaucoup d'inconnus », ça veut dire que la NORMALISATION laisse passer du
 * variable et fabrique des signatures neuves à l'infini.
 *
 * C'est pour ça qu'il crie quand on le touche (A7) : le franchir est un
 * diagnostic, pas une capacité à augmenter.
 */
const MAX_SIGNATURES = 200;

/**
 * FIL-PIÈGE sur la longueur de l'exemplaire.
 *
 * PAS DE REÇU — et c'est dit plutôt que maquillé : mesuré le 30/07, il n'existe
 * encore AUCUN message d'échec sur disque, donc la longueur réelle des messages
 * du fournisseur est inconnue. Valait 2 000, un chiffre choisi au jugé : une
 * MINE, puisque tronquer l'exemplaire détruit précisément ce qu'un humain lit
 * pour écrire le motif manquant.
 *
 * Posé large en attendant la mesure, et la troncature est désormais VISIBLE sur
 * l'entrée — le jour où le fil-piège est touché, on saura la vraie valeur et on
 * remesurera. Un tronçonnage silencieux, lui, ne se serait jamais su.
 */
const MAX_EXEMPLE = 20_000;

/**
 * Le seuil d'arrêt-de-chaîne : deux fois, ce n'est plus un accident.
 *
 * REÇU : ce nombre n'est pas choisi ici, il est REPRIS. La règle fondatrice dit
 * « 2 occurrences = bug prioritaire » (CLAUDE.md, réflexes anti-erreur). Le
 * code ne fait que rendre mécanique une règle qu'on s'appliquait à la main —
 * changer ce 2 voudrait dire changer la règle, pas régler un curseur.
 */
export const SEUIL_ARRET_DE_CHAINE = 2;

// ───────────────────────────── noyau pur ─────────────────────────────

/**
 * La NORMALISATION — le cœur du regroupement, et la seule partie qui pourrait
 * se tromper.
 *
 * Deux messages disent la même chose s'ils ne diffèrent que par leurs parties
 * variables : un identifiant, une heure de reprise, un nombre de jetons. Sans
 * cela, « resets at 3pm » et « resets at 11pm » compteraient pour deux inconnus
 * distincts et n'atteindraient jamais le seuil de deux.
 *
 * Volontairement grossière et sans état : relisible d'un coup d'œil, et le même
 * résultat pour toujours. Trop agressive, elle fondrait deux vraies pannes en
 * une ; c'est le risque assumé, et il se voit — l'exemplaire brut est conservé
 * à côté.
 */
export function signatureDe(message: string): string {
  return (
    message
      .toLowerCase()
      // TOUT mot contenant un chiffre disparaît, pas seulement les chiffres.
      // Remplacer les seuls chiffres laissait `4f2a91` devenir `#f#a#` et
      // `8c7d02` devenir `#c#d#` — deux signatures pour le même identifiant
      // jetable, et le seuil de deux jamais atteint. Un mot qui porte un
      // chiffre est variable en entier : `3pm`, `11pm`, `4f2a91`, `error-500`.
      .replaceAll(/[\p{L}\p{N}_-]*\d[\p{L}\p{N}_-]*/gu, "#")
      .replaceAll(/\s+/gu, " ")
      .trim()
      .slice(0, 300)
  );
}

/**
 * Applique une observation à un carnet et rend le NOUVEAU carnet.
 *
 * Pur : c'est ici qu'est toute la logique qui pourrait se tromper, et elle se
 * teste sans disque. Un message vide ne compte pas — on ne dénombre pas du
 * néant.
 */
export function noter(
  carnet: ReadonlyArray<EntreeCarnet>,
  observation: Observation,
): ReadonlyArray<EntreeCarnet> {
  const message = observation.message.trim();
  if (message.length === 0) return carnet;

  const signature = signatureDe(message);
  const deja = carnet.find((entree) => entree.signature === signature);
  if (deja === undefined) {
    if (carnet.length >= MAX_SIGNATURES) return carnet;
    return [
      ...carnet,
      {
        signature,
        exemple: message.slice(0, MAX_EXEMPLE),
        ...(message.length > MAX_EXEMPLE ? { tronque: true } : {}),
        occurrences: 1,
        premiereVue: observation.maintenant,
        derniereVue: observation.maintenant,
        comptes: [observation.compte],
      },
    ];
  }

  return carnet.map((entree) =>
    entree.signature === signature
      ? {
          ...entree,
          occurrences: entree.occurrences + 1,
          derniereVue: observation.maintenant,
          comptes: entree.comptes.includes(observation.compte)
            ? entree.comptes
            : [...entree.comptes, observation.compte],
        }
      : entree,
  );
}

/**
 * Le plus vu en tête. L'ordre EST le jugement : ce qui revient le plus est ce
 * qu'il faut apprendre à lire en premier.
 */
export function parFrequence(carnet: ReadonlyArray<EntreeCarnet>): ReadonlyArray<EntreeCarnet> {
  return [...carnet].sort((a, b) => b.occurrences - a.occurrences);
}

/** Ce qui a franchi le seuil. Vide = rien à apprendre pour l'instant. */
export function recurrents(carnet: ReadonlyArray<EntreeCarnet>): ReadonlyArray<EntreeCarnet> {
  return parFrequence(carnet).filter((entree) => entree.occurrences >= SEUIL_ARRET_DE_CHAINE);
}

// ───────────────────────────── écorce IO ─────────────────────────────

/**
 * Où le carnet vit. Posé une fois au démarrage du serveur.
 *
 * Tant qu'il vaut `null`, `noterInconnu` ne perd rien : les observations
 * s'empilent en mémoire et partent sur disque au premier câblage.
 */
let chemin: string | null = null;

/** Les observations prises avant que le chemin ne soit connu. */
let enAttente: ReadonlyArray<EntreeCarnet> = [];

export function configurerCarnet(nouveauChemin: string | null): void {
  chemin = nouveauChemin;
}

/** Remet tout à zéro — tests uniquement. */
export function viderCarnet(): void {
  chemin = null;
  enAttente = [];
}

/**
 * Le format sur disque. Décrit par un Schema plutôt que relu à la main : une
 * entrée mal formée est ÉCARTÉE au décodage au lieu de contaminer les
 * compteurs, et le format est lisible d'un coup d'œil.
 */
const EntreeSurDisque = Schema.Struct({
  signature: Schema.String,
  exemple: Schema.String,
  occurrences: Schema.Number,
  premiereVue: Schema.String,
  derniereVue: Schema.String,
  comptes: Schema.Array(Schema.String),
  // Optionnel : les carnets écrits avant l'existence du drapeau se relisent
  // sans lui, et une entrée non tronquée ne le porte pas.
  tronque: Schema.optional(Schema.Boolean),
});
const CarnetSurDisque = Schema.Array(EntreeSurDisque);
const decodeJsonString = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);
const encodeJsonString = Schema.encodeEffect(Schema.UnknownFromJsonString);

const lireFichier = Effect.fn("carnet.lire")(function* (): Effect.fn.Return<
  ReadonlyArray<EntreeCarnet>,
  never,
  FileSystem.FileSystem
> {
  const ou = chemin;
  if (ou === null) return enAttente;
  const fs = yield* FileSystem.FileSystem;
  const texte = yield* fs.readFileString(ou).pipe(Effect.orElseSucceed(() => ""));
  if (texte.trim().length === 0) return enAttente;
  // Fichier illisible, tronqué, ou écrit par une version future : on repart de
  // ce qu'on a en attente plutôt que d'empêcher le serveur de tourner. Le
  // carnet est un observatoire, pas une dépendance.
  const lu = yield* decodeJsonString(texte).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(CarnetSurDisque)),
    Effect.map((entrees) => entrees as ReadonlyArray<EntreeCarnet>),
    Effect.orElseSucceed(() => [] as ReadonlyArray<EntreeCarnet>),
  );
  // Fusion, pas remplacement : ce qui a été noté avant le câblage compte aussi.
  // Une boucle plutôt qu'un `reduce` : ce qu'on fait ici — additionner deux
  // compteurs portant la même signature — se lit d'un trait.
  const fusionne = [...lu];
  for (const attente of enAttente) {
    const index = fusionne.findIndex((e) => e.signature === attente.signature);
    if (index === -1) {
      fusionne.push(attente);
      continue;
    }
    const deja = fusionne[index];
    if (deja === undefined) continue;
    fusionne[index] = { ...deja, occurrences: deja.occurrences + attente.occurrences };
  }
  return fusionne;
});

const ecrireFichier = Effect.fn("carnet.ecrire")(function* (
  carnet: ReadonlyArray<EntreeCarnet>,
): Effect.fn.Return<void, never, FileSystem.FileSystem | Path.Path> {
  const ou = chemin;
  if (ou === null) {
    enAttente = carnet;
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* Effect.gen(function* () {
    const texte = yield* encodeJsonString(carnet);
    yield* fs.makeDirectory(path.dirname(ou), { recursive: true });
    // Temporaire puis renommage : une coupure au mauvais moment laisserait
    // sinon un fichier tronqué, que la relecture jetterait en entier. Le
    // renommage est atomique.
    const provisoire = `${ou}.tmp`;
    yield* fs.writeFileString(provisoire, `${texte}\n`);
    yield* fs.rename(provisoire, ou);
    enAttente = [];
  }).pipe(
    // Disque plein, dossier en lecture seule : l'observation reste en mémoire.
    // Perdre l'observation est regrettable ; faire tomber le serveur pour ça
    // serait pire.
    Effect.catchCause(() =>
      Effect.sync(() => {
        enAttente = carnet;
      }),
    ),
  );
});

/**
 * Note un message d'échec que le classement n'a pas su lire.
 *
 * Idempotent par signature : la même panne vue dix fois fait UNE entrée à dix.
 */
export const noterInconnu = Effect.fn("carnet.noter")(function* (
  observation: Observation,
): Effect.fn.Return<void, never, FileSystem.FileSystem | Path.Path> {
  if (observation.message.trim().length === 0) return;
  const avant = yield* lireFichier();
  const apres = noter(avant, observation);

  // LE FIL-PIÈGE CRIE QUAND ON LE TOUCHE (A7). Rien n'a bougé alors que le
  // message n'était pas vide : le carnet est plein et vient de JETER une
  // signature neuve. Silencieux, ce cas faisait disparaître exactement ce que
  // le carnet existe pour attraper — et pire, il se serait aggravé tout seul,
  // puisqu'un carnet saturé l'est parce que la normalisation fabrique des
  // signatures à l'infini. Le message nomme la limite ET la demande, pour que
  // l'agent qui le lit puisse agir dessus.
  if (apres === avant) {
    yield* Effect.logWarning("carnet: PLEIN — signature neuve JETÉE", {
      limite: MAX_SIGNATURES,
      demande: avant.length + 1,
      compte: observation.compte,
      message: observation.message.slice(0, 200),
      quoiFaire:
        "la normalisation laisse passer du variable : durcir signatureDe(), pas monter la limite",
    });
    return;
  }

  yield* ecrireFichier(apres);
});

/** Le carnet tel qu'il est sur disque, le plus vu en tête. */
export const lireCarnet = Effect.fn("carnet.tout")(function* (): Effect.fn.Return<
  ReadonlyArray<EntreeCarnet>,
  never,
  FileSystem.FileSystem
> {
  return parFrequence(yield* lireFichier());
});
