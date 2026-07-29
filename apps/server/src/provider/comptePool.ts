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
 * Délai avant de retenter un compte écarté, selon le code HTTP.
 *
 * Un 401 est court exprès : il est souvent transitoire (jeton en cours de
 * rafraîchissement), et une installation à un seul compte doit pouvoir s'en
 * remettre sans attendre une heure. Un 429 est une vraie fenêtre de quota.
 */
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
    return { nature: "authentification-morte" };
  }

  // 4xx hors 401/408/429 : c'est NOTRE requête qui est mauvaise. Basculer
  // ne ferait que reproduire la même erreur sur le compte suivant.
  const code = entree.code;
  if (code !== undefined && code >= 400 && code < 500) {
    if (code !== 401 && code !== 408 && code !== 429) {
      return { nature: "notre-faute" };
    }
  }

  const repriseA =
    entree.repriseAnnoncee ??
    new Date(entree.maintenant + delaiRepriseMs(code)).toISOString();

  if (code === 429 || CAUSES_QUOTA.some((motif) => motif.test(message))) {
    return { nature: "quota", repriseA };
  }
  if (code === 401) {
    return { nature: "transitoire", repriseA };
  }
  if (code !== undefined && code >= 500) {
    return { nature: "transitoire", repriseA };
  }
  // Rien d'identifiable : transitoire, avec un refroidissement prudent. On
  // n'invente pas une mort qu'on ne peut pas prouver.
  return { nature: "transitoire", repriseA };
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

/**
 * Choisit le compte qui sert le prochain tour.
 *
 * `dejaTentes` porte les comptes déjà essayés DANS CE TOUR : chacun n'a droit
 * qu'à une tentative, sinon un tour qui échoue partout tournerait en rond.
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
  if (entree.strategie === "ordre") return disponibles[0] ?? null;

  return disponibles.reduce((meilleur, candidat) =>
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
): SanteCompte {
  if (verdict.nature === "notre-faute") return sante;
  if (verdict.nature === "authentification-morte") {
    return { instanceId: sante.instanceId, etat: "mort", raison };
  }
  return {
    instanceId: sante.instanceId,
    etat: "refroidissement",
    ...(verdict.repriseA === undefined ? {} : { repriseA: verdict.repriseA }),
    raison,
  };
}
