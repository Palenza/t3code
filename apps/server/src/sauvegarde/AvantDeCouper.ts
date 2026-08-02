/**
 * AVANT DE COUPER — un redémarrage ne tue pas un travail en vol par surprise.
 *
 * Chantier n°57, chaîne F. Aspiré de `hermes_cli/main.py::cmd_update` (le
 * bloc de gardes avant la mutation) et de sa doctrine, la seule chose de ce
 * fichier-là qui nous concerne encore.
 *
 * ── Ce qu'on ne reprend PAS, et pourquoi ──────────────────────────────────
 *
 * Leur mise à jour est un `git pull` sur la copie de travail : d'où
 * l'autostash, la détection de fork, la résolution de branche, le repli en
 * ZIP quand git casse sous Windows. Rien de tout ça ne nous atteint — chez
 * nous une version s'INSTALLE À CÔTÉ, se vérifie en préflight pendant que le
 * serveur courant tourne encore, et ne devient la version courante qu'après
 * (`cloud/selfUpdate.ts`). Un échec laisse le serveur en vie : notre rollback
 * est structurel, pas un commit épinglé qu'on rejoue.
 *
 * ── Ce qu'on reprend, parce qu'il nous manquait vraiment ──────────────────
 *
 * Une seule chose, et c'est la bonne : **refuser plutôt que courser**. Eux
 * refusent de continuer quand un processus tient un fichier — « tuer l'app de
 * bureau est futile, elle se relance ; l'humain doit la fermer ». Le principe
 * derrière : une mise à jour qui ne peut pas s'appliquer proprement le DIT et
 * s'arrête, au lieu de s'appliquer à moitié.
 *
 * Chez nous, ce qui tient le processus n'est pas un fichier verrouillé, c'est
 * un TOUR D'AGENT EN VOL. Et le coût est plus élevé que chez eux : couper un
 * tour ne le met pas en pause, il passe à `interrupted` — état terminal, il ne
 * reprend pas. Le travail s'arrête là où il en était, fichiers à moitié
 * écrits compris.
 *
 * ── Le fil-piège, avec son reçu ───────────────────────────────────────────
 *
 * Refuser sans fin est une panne aussi : un serveur qu'un tour bloqué empêche
 * de se mettre à jour ne reçoit jamais le correctif suivant. Eux ne traitent
 * pas ce cas. Il faut donc distinguer un tour QUI TRAVAILLE d'une ligne
 * FANTÔME — un tour dont le processus est mort sans jamais reclasser sa
 * ligne.
 *
 * Mesuré sur la base réelle (583 tours clos) :
 *
 *   sqlite3 ~/.t3/userdata/state.sqlite "WITH d AS (SELECT
 *     (julianday(completed_at)-julianday(started_at))*24*60 AS m
 *     FROM projection_turns WHERE started_at IS NOT NULL
 *     AND completed_at IS NOT NULL AND completed_at > started_at) ..."
 *
 *   p50 2,8 min · p95 22,3 min · p99 45,3 min · **max 85,2 min**
 *
 * `FANTOME_APRES_MINUTES = 240` est donc posé à 2,8× le maximum jamais
 * observé : aucun tour sain ne peut le toucher, seul le cassé le touche. Si
 * un jour un tour sain l'atteint, c'est la limite qui a tort — remesurer et
 * mettre à jour ce reçu, jamais l'inverse (A2).
 *
 * Module PUR : on lui donne des faits, il rend un verdict et sa phrase.
 */

/** Un tour d'agent qui n'a pas fini. */
export interface TourEnVol {
  readonly filId: string;
  /** Depuis combien de minutes il tourne. */
  readonly depuisMinutes: number;
}

/** Qui demande le redémarrage. C'est ça qui change la réponse au refus. */
export type Origine =
  /** Quelqu'un vient de cliquer. Il est devant l'écran, on peut lui demander. */
  | "humain-present"
  /** RPC : un téléphone contre un serveur maison. Personne ne verra la question. */
  | "a-distance"
  /** Aucun humain dans la boucle : minuterie, cron, redémarrage automatique. */
  | "automatique";

export type Decision =
  /** Rien en vol, ou l'humain a tranché : on coupe. */
  | "couper"
  /** Il y a du travail en vol et quelqu'un peut répondre : on lui montre le coût. */
  | "demander"
  /** Il y a du travail en vol et personne pour arbitrer : on ne coupe pas. */
  | "refuser";

export interface Demande {
  readonly origine: Origine;
  /** L'humain a explicitement dit « coupe quand même ». */
  readonly malgreLeTravailEnCours: boolean;
}

export interface Verdict {
  readonly decision: Decision;
  /**
   * Ce qu'on écrit. Lu par un HUMAIN quand la décision est `demander`, par un
   * AGENT ou un journal sinon — donc il nomme toujours le nombre, l'âge et ce
   * qui débloque (A7). Une limite atteignable est une limite qu'on doit voir.
   */
  readonly phrase: string;
  /** Les tours qui mourraient si on coupait maintenant, le plus vieux d'abord. */
  readonly victimes: ReadonlyArray<TourEnVol>;
  /** Les lignes trop vieilles pour être du travail. Elles ne bloquent rien. */
  readonly fantomes: ReadonlyArray<TourEnVol>;
}

/**
 * Au-delà, une ligne « en cours » n'est plus du travail : c'est un tour dont
 * le processus est mort sans reclasser sa ligne. Reçu dans l'en-tête : 2,8× le
 * maximum jamais observé sur 583 tours.
 */
export const FANTOME_APRES_MINUTES = 240;

/**
 * Ce qu'on cite dans le refus pour qu'il soit actionnable. Un refus qui ne dit
 * pas quand réessayer force à réessayer au hasard.
 */
const P95_MINUTES = 22;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** Le plus vieux d'abord : c'est celui qu'il coûte le plus cher de perdre. */
const duPlusVieux = (tours: ReadonlyArray<TourEnVol>): ReadonlyArray<TourEnVol> =>
  [...tours].sort((a, b) => b.depuisMinutes - a.depuisMinutes);

/**
 * Peut-on couper maintenant ?
 *
 * Le tri fantôme/travail se fait AVANT toute décision : une ligne fantôme ne
 * doit jamais peser dans la balance, ni comme victime, ni comme motif de
 * refus.
 */
export function avantDeCouper(toursEnVol: ReadonlyArray<TourEnVol>, demande: Demande): Verdict {
  const fantomes = duPlusVieux(toursEnVol.filter((t) => t.depuisMinutes >= FANTOME_APRES_MINUTES));
  const victimes = duPlusVieux(toursEnVol.filter((t) => t.depuisMinutes < FANTOME_APRES_MINUTES));

  const noteFantomes =
    fantomes.length === 0
      ? ""
      : ` (${pluriel(fantomes.length, "ligne")} « en cours » depuis plus de ${FANTOME_APRES_MINUTES} min ${fantomes.length > 1 ? "sont ignorées" : "est ignorée"} : au-delà de ce seuil ce n'est plus du travail, c'est un tour dont le processus est mort sans reclasser sa ligne)`;

  if (victimes.length === 0) {
    return {
      decision: "couper",
      phrase: `Aucun tour en vol : on peut couper${noteFantomes}.`,
      victimes,
      fantomes,
    };
  }

  const combien = pluriel(victimes.length, "tour");
  const plusVieux = victimes[0] as TourEnVol;
  const leCout = `${combien} en vol, le plus ancien depuis ${plusVieux.depuisMinutes} min. Couper ne les met pas en pause : ils passent à « interrompu », état terminal, et le travail s'arrête où il en est.`;

  if (demande.malgreLeTravailEnCours) {
    // On coupe — mais on écrit le reçu de ce qu'on tue. Un forçage silencieux
    // et un forçage assumé ont exactement la même conséquence et pas du tout
    // la même valeur le lendemain.
    return {
      decision: "couper",
      phrase: `Coupure demandée malgré le travail en cours. ${leCout} Fils touchés : ${victimes.map((t) => t.filId).join(", ")}${noteFantomes}.`,
      victimes,
      fantomes,
    };
  }

  if (demande.origine === "humain-present") {
    return {
      decision: "demander",
      phrase: `${leCout} Attendre qu'ils finissent, ou couper quand même ?${noteFantomes}`,
      victimes,
      fantomes,
    };
  }

  return {
    decision: "refuser",
    phrase: `Redémarrage refusé : ${leCout} Personne n'est devant l'écran pour arbitrer, donc on ne tranche pas à sa place. Réessayer plus tard — 95 % des tours finissent en ${P95_MINUTES} min — ou redemander en forçant explicitement${noteFantomes}.`,
    victimes,
    fantomes,
  };
}
