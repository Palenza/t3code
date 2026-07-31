/**
 * QUI A LE DROIT DE PARLER À L'AGENT — la fondation de la passerelle.
 *
 * Chantier n°40, écrit AVANT le moindre adaptateur. C'est le même ordre que
 * pour le cron : le garde de cycle de vie est arrivé avant l'ordonnanceur,
 * parce que c'est lui qui rend le reste sûr.
 *
 * Aspiré de `gateway/authz_mixin.py` (838 l.), dont on reprend la doctrine
 * telle quelle — un an d'incidents réels.
 *
 * ── Ce que ça garde ───────────────────────────────────────────────────────
 *
 * Une passerelle expose l'agent à un salon où n'importe qui peut écrire. Un
 * agent qui a `bypassPermissions` sur la machine d'Enzo, joignable depuis un
 * groupe Telegram public, c'est une machine ouverte. Il n'y a pas de « on
 * verra plus tard » possible ici : la règle vient d'abord.
 *
 * ── La règle, et elle tient en un mot : REFUSER ───────────────────────────
 *
 * Le défaut est le refus. Toujours. Chaque autorisation est un OUI explicite
 * que quelqu'un a posé, jamais l'absence d'un non. Une passerelle qui laisse
 * passer faute de configuration est une passerelle ouverte.
 *
 * ── Le piège qu'ils documentent, et qu'on prend tel quel ──────────────────
 *
 * Un message peut arriver par un canal DÉJÀ authentifié en amont — chez nous,
 * le relais, qui authentifie la connexion avant de livrer. Déléguer à cet
 * amont est légitime, et ce n'est PAS un fail-open : ça ne vaut que pour un
 * message que le transport a explicitement marqué.
 *
 * D'où leur détail, qui vaut d'être copié mot pour mot : ils comparent le
 * marqueur avec `is True`, pas avec sa véracité, « defensive against
 * accidental fail-open » — un objet de test, un champ absent, une valeur
 * tronquée depuis JSON sont tous « vrais » au sens large. Ici c'est `=== true`
 * pour la même raison, et le test le vérifie sur `"true"`, `1` et `{}`.
 *
 * Module PUR.
 */

/** D'où vient le message. Trois niveaux, du plus large au plus précis. */
export interface Provenance {
  /** La plateforme : `telegram`, `discord`, `slack`… */
  readonly plateforme: string;
  /** Le salon, le groupe, la conversation. */
  readonly canal: string;
  /**
   * L'expéditeur, ou `null`.
   *
   * `null` arrive vraiment : Telegram émet des messages d'administrateur
   * anonyme et des diffusions de canal sans expéditeur. Un canal explicitement
   * autorisé doit continuer de fonctionner dans ce cas — sinon l'humain qui l'a
   * autorisé voit ses propres messages refusés sans comprendre.
   */
  readonly expediteur: string | null;
  /**
   * Le transport a-t-il DÉJÀ authentifié ce message ?
   *
   * Posé par notre relais, jamais par le message lui-même. Comparé à `true`
   * strictement — voir l'en-tête.
   */
  readonly authentifieEnAmont?: unknown;
}

/** Ce qu'un humain a explicitement autorisé. Vide = rien ne passe. */
export interface Autorisations {
  /** Canaux appairés, par plateforme : `telegram:-100123`. */
  readonly canaux: ReadonlySet<string>;
  /** Personnes autorisées, par plateforme : `telegram:42`. */
  readonly personnes: ReadonlySet<string>;
}

export type Verdict =
  | { readonly passe: true; readonly pourquoi: string }
  | { readonly passe: false; readonly pourquoi: string; readonly quoiFaire: string };

const cle = (plateforme: string, quoi: string) => `${plateforme}:${quoi}`;

/**
 * Ce message a-t-il le droit d'atteindre l'agent ?
 *
 * L'ordre des contrôles est celui du refus le plus sûr : on ne délègue qu'à
 * un amont qui s'est explicitement porté garant, puis on cherche un OUI
 * explicite, et sinon on refuse en disant quoi faire.
 */
export function quiPeutParler(source: Provenance, autorise: Autorisations): Verdict {
  // 1 · L'amont s'est porté garant. `=== true` et pas « est vrai » : une
  //     chaîne "true", un 1, un objet vide passeraient une vérification
  //     large — et chacun est une façon réaliste de se tromper.
  if (source.authentifieEnAmont === true) {
    return {
      passe: true,
      pourquoi:
        "le transport a authentifié ce message avant de le livrer (relais) ; l'autorisation est déléguée à un amont qui s'est explicitement porté garant",
    };
  }

  // 2 · Le CANAL est appairé. Ce contrôle vient avant l'expéditeur parce
  //     qu'il doit tenir même sans expéditeur — messages anonymes, diffusions.
  if (autorise.canaux.has(cle(source.plateforme, source.canal))) {
    return {
      passe: true,
      pourquoi: `le canal ${source.canal} a été appairé sur ${source.plateforme}`,
    };
  }

  // 3 · La PERSONNE est autorisée, où qu'elle écrive.
  if (
    source.expediteur !== null &&
    autorise.personnes.has(cle(source.plateforme, source.expediteur))
  ) {
    return {
      passe: true,
      pourquoi: `${source.expediteur} est autorisé sur ${source.plateforme}`,
    };
  }

  // 4 · Refus. C'est le DÉFAUT, pas un cas d'erreur.
  const qui = source.expediteur ?? "un expéditeur anonyme";
  return {
    passe: false,
    pourquoi: `${qui} écrit depuis ${source.plateforme}:${source.canal}, et ni ce canal ni cette personne n'ont été autorisés`,
    // A7 : nos refus sont lus par quelqu'un qui doit pouvoir agir.
    quoiFaire: `Pour ouvrir ce canal, appaire-le explicitement (${source.plateforme}:${source.canal}). Aucune configuration absente ne vaut autorisation : la passerelle refuse par défaut, et c'est ce qui empêche un salon public d'atteindre l'agent.`,
  };
}

/**
 * Ce qu'on répond à quelqu'un qui n'a pas le droit.
 *
 * Volontairement PAUVRE : on ne dit ni que l'agent existe, ni qui le possède,
 * ni comment obtenir l'accès. Un refus bavard sur un salon public est une
 * invitation — il apprend à un inconnu qu'il y a quelque chose à forcer.
 */
export const REPONSE_AU_REFUS = "Je ne suis pas configuré pour répondre ici.";
