/**
 * SÛRETÉ D'URL — ce vers quoi un agent n'a aucune raison de naviguer.
 *
 * Chantier n°14, chaîne C. Transfert de DONNÉES depuis `tools/url_safety.py`
 * d'Hermès (862 lignes) : leurs listes sont le fruit d'attaques réelles.
 *
 * ── Le chemin d'attaque, chez NOUS ────────────────────────────────────────
 *
 * `preview_navigate` conduit un onglet de navigateur, et `preview_snapshot`
 * rend le contenu de la page au modèle. Une page hostile déjà lue par l'agent
 * peut donc dire « va voir http://169.254.169.254/latest/meta-data/ » — et le
 * snapshot suivant ramène des identifiants de cloud dans le contexte.
 *
 * C'est le député confus dans sa forme la plus simple : l'agent a le droit de
 * naviguer, le contenu tiers n'a pas le droit de choisir la destination.
 *
 * Vérifié le 31/07 : aucune validation d'URL nulle part côté serveur.
 *
 * ── La nuance qui décide de tout ──────────────────────────────────────────
 *
 * On ne peut PAS bloquer le privé : voir son serveur de dev sur `localhost`
 * est la raison d'être de `preview`. Hermès sépare donc deux niveaux, et
 * c'est ce qu'on reprend :
 *
 *   TOUJOURS bloqué — le lien-local `169.254.0.0/16` en entier, et les points
 *   de métadonnées de cloud. Aucune cible légitime pour un agent, jamais.
 *
 *   PERMIS — `localhost`, le réseau privé, un port de dev. C'est le produit.
 *
 * ── Trois pièges qu'ils ont payés, et un qui s'inverse chez nous ──────────
 *
 * 1. Les variantes IPv4-mappées `::ffff:169.254.169.254`. Un résolveur peut
 *    les rendre, et elles ne sont PAS égales à l'IPv4 pour un comparateur
 *    naïf. Une liste sans elles se contourne en une ligne.
 * 2. `100.64.0.0/10` (CGNAT, RFC 6598) n'est ni privé ni public au sens des
 *    bibliothèques standard : il faut le nommer. **Chez nous la règle
 *    S'INVERSE** — T3 embarque Tailscale, qui vit précisément dans cette
 *    plage. C'est du trafic légitime, on ne le bloque pas.
 * 3. Un secret dans une URL fuit partout : historique du navigateur,
 *    journaux, référents. On le SIGNALE au lieu de le laisser passer muet.
 *
 * Module PUR : on lui donne une URL, il rend un verdict.
 */

export interface VerdictDUrl {
  readonly sur: boolean;
  /** Nommé pour un AGENT (A7) : ce qui a été demandé et pourquoi c'est refusé. */
  readonly pourquoi: string;
  /** Signalements qui n'empêchent PAS la navigation. */
  readonly alertes: ReadonlyArray<string>;
}

/**
 * Noms d'hôtes toujours refusés — points de métadonnées de cloud.
 * Portés depuis `_BLOCKED_HOSTNAMES`.
 */
export const HOTES_INTERDITS: ReadonlySet<string> = new Set([
  "metadata.google.internal",
  "metadata.goog",
]);

/**
 * Adresses toujours refusées, quelle que soit la configuration.
 *
 * C'est la cible SSRF n°1 : ces points rendent des identifiants de cloud sans
 * authentification à qui sait les demander. Portées depuis
 * `_ALWAYS_BLOCKED_IPS`, variantes IPv4-mappées comprises.
 */
export const ADRESSES_INTERDITES: ReadonlySet<string> = new Set([
  "169.254.169.254", // AWS / GCP / Azure / DO / Oracle
  "169.254.170.2", // AWS ECS — identifiants IAM de tâche
  "169.254.169.253", // Azure IMDS
  "100.100.100.200", // Alibaba Cloud
  "fd00:ec2::254", // AWS, en IPv6
  "::ffff:169.254.169.254",
  "::ffff:169.254.170.2",
  "::ffff:169.254.169.253",
  "::ffff:100.100.100.200",
]);

/**
 * Noms de paramètres d'URL qui portent un secret. Portés depuis
 * `_SENSITIVE_QUERY_PARAM_NAMES`.
 */
export const PARAMS_SENSIBLES: ReadonlySet<string> = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth_token",
  "authorization",
  "awsaccesskeyid",
  "client_secret",
  "credential",
  "credentials",
  "jwt",
  "password",
  "passwd",
  "secret",
  "session_id",
  "signature",
  "token",
  "x_amz_security_token",
  "x_amz_signature",
  "x-amz-security-token",
  "x-amz-signature",
]);

/** Schémas acceptés. Tout le reste — `file:`, `data:`, `javascript:` — est refusé. */
const SCHEMAS_PERMIS: ReadonlySet<string> = new Set(["http:", "https:"]);

/**
 * Ramène un hôte à UNE forme comparable.
 *
 * ── Le piège, trouvé dans mon propre portage par son test ─────────────────
 *
 * `new URL("http://[::ffff:169.254.169.254]/")` ne rend PAS
 * `::ffff:169.254.169.254`. Il rend `[::ffff:a9fe:a9fe]` — la forme
 * HEXADÉCIMALE, parce que `a9fe` vaut 169.254. Une liste noire écrite en
 * pointillé ne matche donc jamais, et le contournement tient en une ligne
 * d'URL.
 *
 * C'est exactement le piège qu'Hermès documente pour Python. Il se
 * transpose, avec une aggravation : chez eux il faut PENSER à ajouter les
 * variantes ; ici la plateforme les fabrique toute seule.
 *
 * On ramène donc toute forme IPv4-mappée au pointillé, et on ne compare
 * qu'après.
 */
export function normaliserHote(brut: string): string {
  const nu = brut.replace(/^\[|\]$/gu, "").toLowerCase();
  const enPointille = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(nu);
  if (enPointille !== null) {
    const haut = Number.parseInt(enPointille[1] ?? "", 16);
    const bas = Number.parseInt(enPointille[2] ?? "", 16);
    if (Number.isFinite(haut) && Number.isFinite(bas)) {
      return `${haut >> 8}.${haut & 0xff}.${bas >> 8}.${bas & 0xff}`;
    }
  }
  return nu.replace(/^::ffff:/u, "");
}

function hote(url: URL): string {
  return normaliserHote(url.hostname);
}

/**
 * Une adresse est-elle dans le lien-local `169.254.0.0/16` ?
 *
 * Écrit à la main plutôt qu'avec une bibliothèque de réseau : c'est UN préfixe,
 * et une dépendance de plus pour deux comparaisons serait un problème qu'on
 * n'a pas. La normalisation, elle, fait tout le travail difficile.
 */
export function estLienLocal(adresse: string): boolean {
  return /^169\.254\.\d{1,3}\.\d{1,3}$/u.test(normaliserHote(adresse));
}

/**
 * Le verdict. Refuse peu, mais refuse SANS EXCEPTION ce qui ne sert jamais.
 */
export function verdictDUrl(brut: string): VerdictDUrl {
  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return {
      sur: false,
      pourquoi: `« ${brut} » n'est pas une URL analysable. Donne une adresse absolue, par exemple https://exemple.fr/page.`,
      alertes: [],
    };
  }

  if (!SCHEMAS_PERMIS.has(url.protocol)) {
    return {
      sur: false,
      pourquoi: `Schéma « ${url.protocol} » refusé : seuls http et https sont permis. Un « file: » ou un « javascript: » lit le disque ou exécute du code depuis une page.`,
      alertes: [],
    };
  }

  const nom = hote(url);
  if (HOTES_INTERDITS.has(nom)) {
    return {
      sur: false,
      pourquoi: `« ${nom} » est un point de métadonnées de cloud : il rend des identifiants à qui sait le demander. Aucun agent n'a de raison légitime d'y aller.`,
      alertes: [],
    };
  }
  if (
    ADRESSES_INTERDITES.has(nom) ||
    ADRESSES_INTERDITES.has(normaliserHote(nom)) ||
    estLienLocal(nom)
  ) {
    return {
      sur: false,
      pourquoi: `« ${nom} » est dans le lien-local (169.254.0.0/16), où vivent les points de métadonnées de cloud. Toujours refusé — contrairement à localhost et au réseau privé, qui restent permis pour voir un serveur de dev.`,
      alertes: [],
    };
  }

  // Ce qui n'empêche pas d'y aller, mais qu'on ne tait pas.
  const alertes: string[] = [];
  const sensibles = [...url.searchParams.keys()].filter((cle) =>
    PARAMS_SENSIBLES.has(cle.toLowerCase()),
  );
  if (sensibles.length > 0) {
    alertes.push(
      `L'URL porte un secret dans ses paramètres (${sensibles.join(", ")}). Un secret dans une URL fuit dans l'historique du navigateur, les journaux et les référents.`,
    );
  }

  return { sur: true, pourquoi: "", alertes };
}
