// @effect-diagnostics globalDate:off - Les instants de reprise entrent et sortent
// d'ici en ISO ; ce module reste pur, l'horloge est toujours passée en argument.
import type { ProviderInstanceId, ServerProviderRateLimits } from "@t3tools/contracts";

/**
 * Le pool de comptes — QUEL compte sert le prochain tour, et quand un compte
 * écarté revient.
 *
 * Pourquoi ce module existe (constat fondateur 29/07) : trois abonnements Max,
 * et à l'instant où ces lignes sont écrites, un compte à 94 % de sa fenêtre
 * hebdomadaire pendant que deux autres sont à 26 % et 37 %. Les quotas ne se
 * reportent pas : ce qui n'est pas consommé chaque semaine est perdu. Le
 * problème n'est donc PAS « que faire quand un compte tombe » — c'est « ne
 * jamais laisser deux comptes dormir pendant qu'un troisième étouffe ». La
 * bascule sur panne n'est qu'un cas particulier de la répartition.
 *
 * CE MODULE EST PUR. Aucune lecture disque, aucun appel réseau, aucune
 * horloge : `maintenant` est toujours passé en argument. C'est ce qui permet
 * de le tester contre de vraies charges d'erreur de fournisseur sans monter
 * un runtime.
 *
 * Frontière avec l'existant, et elle est stricte : `rateLimitStore` reste
 * L'UNIQUE source de vérité sur la CONSOMMATION d'un compte. Ce module ne
 * recompte rien — il reçoit ces chiffres et n'ajoute que ce que le store
 * ignore : la SANTÉ (un compte est-il utilisable maintenant), l'heure de
 * reprise, et ce qui a déjà été tenté dans le tour courant. Deux compteurs
 * pour la même métrique seraient deux vérités, donc une fausse.
 */

/**
 * Trois états, et le troisième est celui qui compte.
 *
 * `mort` n'est pas un `refroidissement` très long : un jeton révoqué ne
 * guérit jamais tout seul. Sans cette distinction, on le remet dans la
 * rotation à chaque tour et on brûle un essai à chaque fois, indéfiniment.
 * Seule une ré-authentification le ressuscite.
 */
export type EtatCompte = "ok" | "refroidissement" | "mort";

export interface SanteCompte {
  readonly instanceId: ProviderInstanceId;
  readonly etat: EtatCompte;
  /** Instant ISO où un compte en refroidissement redevient utilisable. */
  readonly repriseA?: string;
  /** Ce qui l'a mis là — affiché tel quel, jamais deviné. */
  readonly raison?: string;
  /**
   * Échecs « transitoires » d'affilée depuis la dernière réussite.
   *
   * Le mot « transitoire » est une CLAIM, pas un fait : c'est ce que le message
   * d'erreur laisse croire. Quand la même claim se répète, elle devient fausse
   * — et sans ce compteur, on la croyait indéfiniment.
   */
  readonly echecsDAffilee?: number;
}

/**
 * Ce qu'on fait d'un échec. Le pilotage se fait sur la NATURE de l'échec, pas
 * sur « ça a raté » : sans ce tri, une requête malformée (400) déclencherait
 * un essai sur chaque compte et en brûlerait trois pour une erreur qui ne
 * vient d'aucun d'eux.
 */
export type NatureEchec =
  | "quota" // le compte est à sec — écarter, réessayer ailleurs
  | "authentification-morte" // jeton révoqué — écarter DÉFINITIVEMENT
  | "transitoire" // hoquet réseau/serveur — réessayer ailleurs
  | "notre-faute"; // requête invalide — NE PAS basculer, la faute suivrait

export interface Verdict {
  readonly nature: NatureEchec;
  /** Quand ce compte peut re-servir ; absent si mort ou si ce n'est pas sa faute. */
  readonly repriseA?: string;
  /**
   * Le message a-t-il été RECONNU, ou est-on tombé dans le repli prudent ?
   *
   * Deux pannes réelles ont traversé ce classement sans être vues, la même
   * nuit du 30/07 : « out of usage credits » et « OAuth session expired and
   * could not be refreshed ». Aucune ne correspondait à un motif, chacune est
   * devenue un « transitoire » silencieux, et le fondateur s'est retrouvé
   * devant un fil mort sans explication.
   *
   * Ajouter un motif après coup ne corrige que le cas d'hier. Ce drapeau
   * corrige la CLASSE : un message inconnu se signale, avec son texte exact,
   * au lieu de se déguiser en verdict.
   */
  readonly reconnu: boolean;
}

/**
 * Causes d'échec d'authentification définitives, tirées des specs OAuth
 * plutôt que devinées : RFC 7009 (révocation), RFC 6749 (refresh rejeté),
 * RFC 6750 (jeton porteur invalide), plus les libellés propres aux
 * fournisseurs. Réessayer sur l'une d'elles est garanti d'échouer.
 */
const CAUSES_MORTELLES: ReadonlyArray<RegExp> = [
  /token[_ ]revoked/i,
  /token[_ ]invalidated/i,
  /invalid[_ ]grant/i,
  /refresh[_ ]token[_ ]reused/i,
  /unauthorized[_ ]client/i,
  /authentication token has been invalidated/i,
  // Vue en vrai le 30/07 : « Failed to authenticate: OAuth session expired and
  // could not be refreshed ». Le rafraîchissement a DÉJÀ échoué — attendre ne
  // sert à rien, il faut se reconnecter. Elle passait pour « transitoire ».
  /oauth session expired/i,
  /session expired and could not be refreshed/i,
  /could not be refreshed/i,
];

/**
 * L'ÉTAT DE SESSION CASSÉ — et la bascule est le pire remède.
 *
 * Deux pannes vues en vrai le 31/07, signalées par le drapeau `reconnu` :
 *
 *   [ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use
 *   No conversation found with session ID: d9b0e2ac-…
 *
 * Aucune ne vient du compte. La première dit que le tour s'est arrêté sur un
 * appel d'outil dont le contenu manque — un état de conversation incohérent.
 * La seconde dit que la CLI ne retrouve pas la session sur disque.
 *
 * Les deux tombaient dans « transitoire », donc le pool BASCULAIT de compte.
 * Or chaque compte a son propre dossier de sessions : le suivant ne retrouvera
 * pas davantage cette conversation, et le suivant non plus. On brûlait donc
 * les comptes un par un pour une faute qui n'est celle d'aucun d'eux — les
 * quotas à 95 % et 100 % du 31/07 se sont vidés en partie comme ça.
 *
 * `notre-faute` : on NE bascule PAS, on s'arrête et on le dit.
 */
const CAUSES_SESSION_CASSEE: ReadonlyArray<RegExp> = [
  /no conversation found with session id/i,
  /\[ede_diagnostic\]/i,
  /adapter thread is closed/i,
  /session (?:is )?closed/i,
];

/** Un quota atteint — le compte reviendra, mais pas tout de suite. */
const CAUSES_QUOTA: ReadonlyArray<RegExp> = [
  /usage limit reached/i,
  /usage limit exceeded/i,
  /reached your usage limit/i,
  /hit your (?:usage|session) limit/i,
  /plan limit reached/i,
  /quota exceeded/i,
  /rate[_ ]limit/i,
  /too many requests/i,
];

/**
 * Le SOLDE épuisé — pas un quota qui repart tout seul.
 *
 * Rencontré en vrai le 30/07 : « You're out of usage credits. Run
 * /usage-credits to keep using Fable 5 or /model to switch models. » Aucun
 * motif ci-dessus ne l'attrape, alors le relais — bâti pour EXACTEMENT ce
 * moment-là — n'a jamais tiré, et le tour est mort en « Runtime error ».
 *
 * La différence avec un quota compte : un quota revient à l'heure dite, un
 * solde ne revient qu'après une recharge. On l'écarte donc pour longtemps
 * plutôt que de le retenter toutes les heures pour rien.
 */
const CAUSES_SOLDE: ReadonlyArray<RegExp> = [
  /out of usage credits/i,
  /insufficient credits/i,
  /no credits remaining/i,
  /credit balance is too low/i,
  /out of credits/i,
];

/** Un solde ne se recharge pas tout seul : inutile de sonder toutes les heures. */
const REPRISE_SOLDE_MS = 12 * 60 * 60_000;

/**
 * Délai avant de retenter un compte écarté, selon le code HTTP.
 *
 * Un 401 est court exprès : il est souvent transitoire (jeton en cours de
 * rafraîchissement), et une installation à un seul compte doit pouvoir s'en
 * remettre sans attendre une heure. Un 429 est une vraie fenêtre de quota.
 */
/**
 * L'escalade des transitoires — multiplicateurs appliqués à l'attente que le
 * verdict a calculée, selon le nombre d'échecs d'affilée.
 *
 * Le principe vient de l'usine Palenza, où l'attente n'est pas une punition
 * uniforme mais une PRÉDICTION DE FERTILITÉ : ce qui a échoué six fois de suite
 * n'a pas la même chance de marcher au septième essai qu'au deuxième. Ici
 * l'attente de départ vaut d'être respectée — elle est DÉDUITE d'un signal réel
 * (401 → 5 min, 429 → 1 h) — donc les deux premiers essais la gardent telle
 * quelle, et l'escalade ne commence qu'après.
 *
 * Sans cela, un compte définitivement cassé mais dont l'erreur ressemble à un
 * hoquet était retenté toutes les heures, à vie.
 */
const PALIERS_TRANSITOIRE = [1, 1, 4, 4, 12] as const;

/**
 * L'attente ne dépasse JAMAIS ça, quel que soit le nombre d'échecs.
 *
 * Contrairement à l'usine, un compte ne devient jamais « dormant » ici : la
 * dormance rendrait les trois comptes inutilisables en même temps lors d'une
 * panne globale (réseau coupé), et l'app n'aurait plus aucun compte. Un
 * plafond long arrête la boucle de retentatives sans jamais fermer la porte.
 */
const PLAFOND_TRANSITOIRE_MS = 12 * 60 * 60_000;

const REPRISE_401_MS = 5 * 60_000;
const REPRISE_429_MS = 60 * 60_000;
const REPRISE_DEFAUT_MS = 60 * 60_000;

export function delaiRepriseMs(code: number | undefined): number {
  if (code === 401) return REPRISE_401_MS;
  if (code === 429) return REPRISE_429_MS;
  return REPRISE_DEFAUT_MS;
}

/**
 * Classe un échec de tour. `repriseAnnoncee` — le `resetAt` du fournisseur ou
 * son en-tête `Retry-After` — l'emporte TOUJOURS sur notre délai : quand le
 * serveur dit lui-même quand revenir, notre heuristique ne vaut rien à côté.
 */
export function classerEchec(entree: {
  readonly code?: number | undefined;
  readonly message?: string | undefined;
  readonly repriseAnnoncee?: string | undefined;
  readonly maintenant: number;
}): Verdict {
  const message = entree.message ?? "";

  if (CAUSES_MORTELLES.some((motif) => motif.test(message))) {
    return { nature: "authentification-morte", reconnu: true };
  }

  // AVANT tout le reste : une session cassée n'appartient à aucun compte.
  // Placé ici parce qu'un de ces messages peut arriver avec un code 5xx, qui
  // le classerait « transitoire » plus bas — et relancerait la bascule.
  if (CAUSES_SESSION_CASSEE.some((motif) => motif.test(message))) {
    return { nature: "notre-faute", reconnu: true };
  }

  // 4xx hors 401/408/429 : c'est NOTRE requête qui est mauvaise. Basculer
  // ne ferait que reproduire la même erreur sur le compte suivant.
  const code = entree.code;
  if (code !== undefined && code >= 400 && code < 500) {
    if (code !== 401 && code !== 408 && code !== 429) {
      return { nature: "notre-faute", reconnu: true };
    }
  }

  const repriseA =
    entree.repriseAnnoncee ?? new Date(entree.maintenant + delaiRepriseMs(code)).toISOString();

  // Le solde AVANT le quota : « out of usage credits » ne doit pas être
  // confondu avec une limite qui repart d'elle-même dans l'heure.
  if (CAUSES_SOLDE.some((motif) => motif.test(message))) {
    return {
      nature: "quota",
      reconnu: true,
      repriseA:
        entree.repriseAnnoncee ?? new Date(entree.maintenant + REPRISE_SOLDE_MS).toISOString(),
    };
  }
  if (code === 429 || CAUSES_QUOTA.some((motif) => motif.test(message))) {
    return { nature: "quota", repriseA, reconnu: true };
  }
  if (code === 401) {
    return { nature: "transitoire", repriseA, reconnu: true };
  }
  if (code !== undefined && code >= 500) {
    return { nature: "transitoire", repriseA, reconnu: true };
  }
  // Rien d'identifiable : transitoire, avec un refroidissement prudent. On
  // n'invente pas une mort qu'on ne peut pas prouver — mais on ne fait plus
  // SEMBLANT de savoir : `reconnu: false` oblige l'appelant à le dire tout
  // haut, avec le texte exact. C'est comme ça que la taxonomie apprend du
  // réel au lieu d'attendre que le fondateur bute dessus.
  return { nature: "transitoire", repriseA, reconnu: false };
}

/** L'état d'un compte à un instant donné, refroidissement expiré compris. */
export function etatA(sante: SanteCompte, maintenant: number): EtatCompte {
  if (sante.etat !== "refroidissement") return sante.etat;
  if (sante.repriseA === undefined) return "ok";
  const reprise = Date.parse(sante.repriseA);
  if (Number.isNaN(reprise)) return "ok";
  return reprise <= maintenant ? "ok" : "refroidissement";
}

/**
 * Comment on choisit parmi les comptes disponibles.
 *
 * `moins-charge` est le mode qui répond au problème réel : il vise le compte
 * dont la fenêtre la plus contrainte est la moins entamée, donc il vide les
 * comptes qui dorment avant de toucher à celui qui étouffe. `ordre` sert
 * quand on veut une préférence explicite (un compte payé, un compte d'appoint).
 */
export type Strategie = "moins-charge" | "ordre";

export interface Candidat {
  readonly instanceId: ProviderInstanceId;
  readonly sante: SanteCompte;
  /** Tel quel depuis `rateLimitStore` — ce module ne recompte jamais. */
  readonly quotas?: ServerProviderRateLimits | undefined;
}

/**
 * Le pire pourcentage parmi les fenêtres d'un compte : c'est la fenêtre la
 * plus entamée qui décide quand le compte tombera, pas la moyenne. Un compte
 * sans mesure vaut 0 — il n'a rien consommé qu'on sache, et le faire passer
 * pour chargé le condamnerait à ne jamais être choisi.
 */
export function chargeDe(quotas: ServerProviderRateLimits | undefined): number {
  const fenetres = quotas?.windows;
  if (fenetres === undefined || fenetres.length === 0) return 0;
  let pire = 0;
  for (const fenetre of fenetres) {
    const pourcent = fenetre.utilization;
    if (typeof pourcent === "number" && Number.isFinite(pourcent) && pourcent > pire) {
      pire = pourcent;
    }
  }
  return pire;
}

/** Le fournisseur a-t-il déjà dit NON à ce compte ? La mesure prime sur tout. */
export function estAuMur(quotas: ServerProviderRateLimits | undefined): boolean {
  return quotas?.windows.some((fenetre) => fenetre.severity === "rejected") ?? false;
}

/**
 * Choisit le compte qui sert le prochain tour.
 *
 * `dejaTentes` porte les comptes déjà essayés DANS CE TOUR : chacun n'a droit
 * qu'à une tentative, sinon un tour qui échoue partout tournerait en rond.
 *
 * Les comptes dont une fenêtre est `severity: "rejected"` passent DERNIERS :
 * le fournisseur a déjà refusé, et — cas vérifié en réel le 28/07 — ces
 * fenêtres arrivent souvent SANS pourcentage, donc `chargeDe` les scorait 0
 * et « moins-charge » en faisait les préférés du relais (audit 29/07). On ne
 * les exclut pas : quand il ne reste qu'eux, mieux vaut un essai qu'un
 * abandon — mais jamais avant un compte sain.
 *
 * Renvoie `null` quand il ne reste rien — et l'appelant DOIT le dire fort
 * plutôt que de retomber en silence sur un compte à sec.
 */
export function choisir(entree: {
  readonly candidats: ReadonlyArray<Candidat>;
  readonly strategie: Strategie;
  readonly dejaTentes?: ReadonlySet<ProviderInstanceId> | undefined;
  readonly maintenant: number;
}): Candidat | null {
  const tentes = entree.dejaTentes ?? new Set<ProviderInstanceId>();
  const disponibles = entree.candidats.filter(
    (candidat) =>
      !tentes.has(candidat.instanceId) && etatA(candidat.sante, entree.maintenant) === "ok",
  );
  if (disponibles.length === 0) return null;
  const sains = disponibles.filter((candidat) => !estAuMur(candidat.quotas));
  const vivier = sains.length > 0 ? sains : disponibles;
  if (entree.strategie === "ordre") return vivier[0] ?? null;

  return vivier.reduce((meilleur, candidat) =>
    chargeDe(candidat.quotas) < chargeDe(meilleur.quotas) ? candidat : meilleur,
  );
}

/**
 * Applique un échec à la santé d'un compte.
 *
 * `notre-faute` ne touche à rien : le compte n'a rien fait de mal, l'écarter
 * reviendrait à se punir soi-même d'avoir mal formulé une requête.
 */
export function appliquerEchec(
  sante: SanteCompte,
  verdict: Verdict,
  raison: string,
  maintenant: number,
): SanteCompte {
  // Notre bug : le compte n'y est pour rien, il ne se dégrade pas et le
  // compteur ne bouge pas. Le compter reviendrait à punir un compte sain pour
  // une requête qu'on a mal formée.
  if (verdict.nature === "notre-faute") return sante;

  if (verdict.nature === "authentification-morte") {
    return { instanceId: sante.instanceId, etat: "mort", raison };
  }

  // Le quota porte une reprise MESURÉE : le fournisseur a dit quand il revient.
  // L'escalader serait remplacer un fait par une supposition.
  if (verdict.nature === "quota") {
    return {
      instanceId: sante.instanceId,
      etat: "refroidissement",
      ...(verdict.repriseA === undefined ? {} : { repriseA: verdict.repriseA }),
      raison,
    };
  }

  const echecsDAffilee = (sante.echecsDAffilee ?? 0) + 1;
  const base =
    verdict.repriseA === undefined
      ? REPRISE_DEFAUT_MS
      : Math.max(0, Date.parse(verdict.repriseA) - maintenant);
  const palier =
    PALIERS_TRANSITOIRE[Math.min(echecsDAffilee - 1, PALIERS_TRANSITOIRE.length - 1)] ?? 1;
  const attente = Math.min(
    Number.isNaN(base) ? REPRISE_DEFAUT_MS : base * palier,
    PLAFOND_TRANSITOIRE_MS,
  );

  return {
    instanceId: sante.instanceId,
    etat: "refroidissement",
    repriseA: new Date(maintenant + attente).toISOString(),
    raison,
    echecsDAffilee,
  };
}
