/**
 * CAVIARDER — aucun secret ne doit atteindre un journal.
 *
 * Absorption d'Hermès (`agent/redact.py`, 985 lignes rien que pour ça),
 * chantiers n°11 et n°17 du catalogue. T3 n'avait RIEN côté serveur : un seul
 * fichier « redacted » dans tout le dépôt, et c'est un composant d'affichage.
 *
 * Module PUR : aucune base, aucun effet, aucune dépendance.
 *
 * ── Le masquage à deux étages ──────────────────────────────────────────────
 *
 * Un secret entièrement remplacé par `***` rend les journaux inutiles : on ne
 * peut plus dire QUELLE clé a échoué quand on en fait tourner trois. Un
 * secret laissé en clair est une fuite. Hermès tranche par la longueur, on
 * reprend leur seuil :
 *
 *   · court (< 18 caractères) → tout masqué. Trop peu d'entropie : montrer
 *     six caractères sur douze, c'est en montrer la moitié.
 *   · long                    → 6 en tête, 4 en queue. De quoi RECONNAÎTRE
 *     la clé sans pouvoir s'en servir.
 *
 * ── La leçon qu'on leur prend telle quelle ─────────────────────────────────
 *
 * Les noms de champs sensibles se comparent en correspondance EXACTE, jamais
 * en sous-chaîne. Sinon `token_count` et `session_id` se font caviarder — et
 * un journal où les compteurs sont masqués devient illisible, ce qui pousse à
 * désactiver le caviardage. Un garde trop zélé finit désarmé.
 */

import { bornesDuGroupe, decouper, type BorneSecrete } from "./spansSecrets.ts";
import { nomDEnvironnement, valeurPlausiblementSecrete } from "./valeurPlausible.ts";

/** Longueur en-dessous de laquelle on masque TOUT. */
export const SEUIL_MASQUAGE_TOTAL = 18;
export const TETE_VISIBLE = 6;
export const QUEUE_VISIBLE = 4;

/**
 * Masque une valeur pour l'affichage, en gardant de quoi la reconnaître.
 *
 * `vide` est rendu tel quel pour une valeur vide : afficher `***` là où il
 * n'y a rien laisse croire qu'un secret est configuré alors qu'il manque —
 * exactement le genre de faux positif qui fait chercher pendant une heure.
 */
export function masquer(valeur: string): string {
  if (valeur.length === 0) return "";
  if (valeur.length < SEUIL_MASQUAGE_TOTAL) return "***";
  return `${valeur.slice(0, TETE_VISIBLE)}***${valeur.slice(-QUEUE_VISIBLE)}`;
}

/**
 * Les jetons reconnaissables à leur préfixe de fournisseur.
 *
 * Chacun est ancré sur un préfixe VÉRIFIABLE — on ne caviarde jamais « une
 * longue chaîne qui pourrait être un secret », sinon un hash git, un
 * identifiant de session ou un chemin encodé disparaissent des journaux.
 */
const JETONS: ReadonlyArray<RegExp> = [
  /\bsk-ant-[A-Za-z0-9_-]{10,}/gu, // Anthropic
  /\bsk-[A-Za-z0-9_-]{20,}/gu, // OpenAI, OpenRouter
  /\bsk_[A-Za-z0-9_]{20,}/gu, // ElevenLabs (souligné, pas tiret)
  /\bgh[pousr]_[A-Za-z0-9]{20,}/gu, // GitHub : PAT, OAuth, user, serveur, rafraîchissement
  /\bgithub_pat_[A-Za-z0-9_]{20,}/gu,
  /\bAKIA[A-Z0-9]{16}\b/gu, // AWS, identifiant de clé
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/gu, // Slack
  /\bAIza[A-Za-z0-9_-]{30,}/gu, // Google
  /\bglpat-[A-Za-z0-9_-]{20,}/gu, // GitLab
  /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/gu, // Telegram
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gu, // JWT
];

/**
 * Les noms qui désignent un secret — correspondance EXACTE sur le nom, pas
 * sur une sous-chaîne.
 *
 * `token_count`, `session_id`, `key_order` ne sont PAS des secrets. Les
 * caviarder rend les journaux illisibles et pousse à couper le caviardage.
 */
const NOMS_SECRETS = new Set([
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "token",
  "api_key",
  "apikey",
  "client_secret",
  "clientsecret",
  "password",
  "passwd",
  "secret",
  "auth",
  "authorization",
  "jwt",
  "private_key",
  "privatekey",
  "credential",
  "credentials",
  "bearer",
  // ── Les composés, ajoutés le 03/08 ────────────────────────────────────
  // `R2_SECRET_ACCESS_KEY` sortait EN CLAIR : la liste connaissait `api_key`
  // et `private_key`, mais ni `access_key`, ni `secret_key`, ni la forme à
  // TROIS segments. C'est la famille des clés d'objet (R2, S3, Supabase) —
  // celles du data-lake. Trouvé par l'audit adversarial, rejoué ici.
  "access_key",
  "secret_key",
  "secret_access_key",
  "access_key_id",
  "encryption_key",
  "signing_key",
  "role_key",
  "service_key",
  "session_key",
  "webhook_secret",
  "auth_token",
  "session_token",
  "connection_string",
  "dsn",
  "passphrase",
]);

const normaliser = (nom: string) => nom.toLowerCase().replaceAll(/[\s-]/gu, "_");

/**
 * `true` si ce nom de champ désigne un secret.
 *
 * La correspondance porte sur le nom ENTIER ou sur son SUFFIXE en segments —
 * jamais sur une sous-chaîne. `ANTHROPIC_API_KEY` finit par `api_key`, donc
 * c'en est un ; `TOKEN_COUNT` finit par `count`, donc non. Sans la règle de
 * suffixe, toutes les variables d'environnement préfixées passaient au
 * travers, ce qui est le cas le PLUS courant dans un journal.
 *
 * Le suffixe, et pas « contient » : `key_order` contient « key » et n'est pas
 * un secret. Un garde qui masque les compteurs rend le journal illisible, et
 * un journal illisible se fait désactiver.
 */
export function nomSensible(nom: string): boolean {
  const propre = normaliser(nom.trim());
  if (NOMS_SECRETS.has(propre) || NOMS_SECRETS.has(propre.replaceAll("_", ""))) return true;
  const segments = propre.split("_").filter((part) => part.length > 0);
  // TROIS segments, pas deux : `secret_access_key` en fait trois, et c'est
  // exactement la forme des clés d'objet qui sortaient en clair.
  for (let taille = 1; taille <= Math.min(3, segments.length - 1); taille += 1) {
    const suffixe = segments.slice(segments.length - taille).join("_");
    if (NOMS_SECRETS.has(suffixe) || NOMS_SECRETS.has(suffixe.replaceAll("_", ""))) return true;
  }
  return false;
}

/**
 * Les affectations, chacune avec SON remplaçant.
 *
 * Une seule fonction pour les deux formes était un piège : la forme
 * environnement a un groupe de nom et trois de valeur, la forme JSON/YAML en
 * a deux et deux. En indexant « à la position 2 », on cherchait la valeur au
 * mauvais endroit et rien n'était masqué — un caviardage silencieusement
 * inopérant, c'est-à-dire la pire des deux façons d'échouer.
 */

/** `FOO=valeur`, en shell comme en `.env`. */
const AFFECTATION_ENV =
  /\b([A-Za-z_][A-Za-z0-9_-]*)[^\S\r\n]*=[^\S\r\n]*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s;&|]+))/gu;

/** `"clé": "valeur"` en JSON, `clé: valeur` en YAML. */
const AFFECTATION_OBJET =
  /(?:"([A-Za-z_][A-Za-z0-9_-]*)"|\b([A-Za-z_][A-Za-z0-9_-]*))[^\S\r\n]*:[^\S\r\n]*(?:"([^"\n]*)"|([^\s,}\n]+))/gu;

/**
 * Les noms que la passe d'affectation NE doit pas retoucher.
 *
 * `Authorization: Bearer <jeton>` est déjà traité par sa règle dédiée, qui
 * garde délibérément le schéma. La passe d'affectation y voyait un couple
 * clé/valeur et masquait « Bearer » à son tour : le journal rendait
 * « Authorization: *** opaqu***2345 » — schéma perdu, et aucune sécurité
 * gagnée.
 */
const DEJA_TRAITES = new Set(["authorization", "proxy_authorization"]);

/** Un en-tête d'autorisation, quel que soit son schéma. */
/**
 * ⚠️ `[^\S\r\n]` et JAMAIS `\s` : `\s` traverse les retours à la ligne, donc
 * `Authorization:` en fin de ligne capturait le premier mot de la ligne
 * SUIVANTE et le remplacement les fusionnait. Mesuré le 03/08 sur le dépôt :
 * 459 lignes PERDUES, tout le fichier décalé après le premier en-tête. Un
 * agent recevait un fichier dont les numéros de ligne ne collaient plus au
 * disque.
 */
const EN_TETE_AUTH =
  /\b(authorization|proxy-authorization)[^\S\r\n]*:[^\S\r\n]*(\S+)([^\S\r\n]+\S+)?/giu;

/** Les paramètres d'URL sensibles — le nom décide, là encore. */
const PARAM_URL = /([?&])([A-Za-z_][A-Za-z0-9_-]*)=([^&\s"']+)/gu;

/**
 * Le mot de passe DANS une URL — `schéma://utilisateur:motdepasse@hôte`.
 *
 * Trouvé par le ratissage du 02/08 (contre-visite d'agent-reach), puis rejoué
 * ici même : `https://enzo:motdepasse@git.exemple.com` et
 * `postgres://admin:Sup3rS3cret@db.interne:5432` sortaient INCHANGÉS — donc en
 * clair — par l'export Markdown d'un fil et par la porte de sortie MCP. Un
 * simple `git remote -v` collé dans une conversation partait en clair chez le
 * destinataire.
 *
 * Seul le MOT DE PASSE tombe. L'utilisateur et l'hôte restent lisibles :
 * savoir QUEL compte sur QUEL hôte est ce qui rend un journal utile, et
 * `ssh://git@github.com` (un utilisateur sans mot de passe) doit traverser
 * intact.
 */
const MOT_DE_PASSE_URL = /\b([a-z][a-z0-9+.-]*:\/\/[^\s/:@"']+):([^\s/@"']+)@/giu;

/** Une clé privée en bloc PEM : on ne garde jamais le moindre morceau. */
const CLE_PRIVEE = /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/gu;

/**
 * Caviarde un texte avant qu'il n'atteigne un journal, une trace ou une
 * sortie d'outil.
 *
 * L'ordre compte : les blocs PEM d'abord (ils contiennent des retours à la
 * ligne et des `=` qui feraient dérailler les autres motifs), puis les jetons
 * reconnaissables, puis ce que le NOM désigne.
 */
export function caviarder(texte: string): string {
  if (texte.length === 0) return texte;

  // ── LE DÉCOUPAGE, ET PLUS JAMAIS LA RECONSTRUCTION ────────────────────────
  //
  // Chaque passe ne rend que des BORNES ; le texte hors bornes est recopié à
  // l'octet près (cf. spansSecrets.ts). Trois conséquences, toutes voulues :
  // aucune structure ne peut être réécrite, aucun retour à la ligne ne peut
  // disparaître, et un remplacement contenant « $& » ne peut pas se
  // ré-injecter puisque le masque passe par un appel de fonction.
  //
  // Et LE NOM NE DÉCIDE PLUS SEUL. Une clé nommée `token` dont la valeur est
  // `none`, `${{ secrets.X }}` ou `mcpSession.authorizationHeader` n'est pas un
  // secret : `valeurPlausiblementSecrete` la laisse passer. Mesuré avant :
  // 800 fichiers du dépôt altérés sur 15 255, sans qu'aucun ne contienne le
  // moindre secret.
  const bornes: BorneSecrete[] = [];

  // Les blocs PEM en premier : ils contiennent des retours à la ligne et des
  // « = » qui feraient dérailler tout le reste.
  for (const trouve of texte.matchAll(CLE_PRIVEE)) {
    if (trouve.index !== undefined) {
      bornes.push({ debut: trouve.index, fin: trouve.index + trouve[0].length });
    }
  }

  // Les jetons à préfixe connu. Ils se reconnaissent SEULS, où qu'ils soient :
  // aucun test de nom, aucun test de plausibilité — le préfixe EST la preuve.
  for (const motif of JETONS) {
    for (const trouve of texte.matchAll(motif)) {
      if (trouve.index !== undefined) {
        bornes.push({ debut: trouve.index, fin: trouve.index + trouve[0].length });
      }
    }
  }

  // Le mot de passe d'une URL : seule la position mot de passe tombe.
  // L'utilisateur et l'hôte restent lisibles — savoir QUEL compte sur QUEL
  // hôte est ce qui rend une trace utile, et `ssh://git@github.com` (un
  // utilisateur sans mot de passe) doit traverser intact.
  // Le `***` refusé ici est ce qui rend l'opération IDEMPOTENTE : sans lui, un
  // texte déjà caviardé se fait re-caviarder et le masque grossit à chaque
  // passage. Un caviardage qui n'est pas idempotent finit par tout effacer.
  bornes.push(
    ...bornesDuGroupe(
      texte,
      MOT_DE_PASSE_URL,
      2,
      (valeur) => valeur.length > 0 && !valeur.includes("***"),
    ),
  );

  // L'en-tête d'autorisation. Le SCHÉMA reste (« Bearer », « Basic ») : il
  // aide à déboguer et ne révèle rien. Seule la partie qui suit est masquée,
  // et seulement si elle est plausible — dans du code source,
  // `Authorization: mcpSession.authorizationHeader` n'est pas un secret.
  bornes.push(
    ...bornesDuGroupe(texte, EN_TETE_AUTH, 3, (valeur) =>
      valeurPlausiblementSecrete(valeur.trim()),
    ),
  );
  bornes.push(
    ...bornesDuGroupe(
      texte,
      EN_TETE_AUTH,
      2,
      (valeur, entier) => entier[3] === undefined && valeurPlausiblementSecrete(valeur),
    ),
  );

  // Les paramètres d'URL, puis les affectations : le nom donne l'indice, la
  // valeur donne le verdict.
  const nommeEtPlausible = (valeur: string, entier: RegExpExecArray, indexDuNom: number) => {
    const nom = entier[indexDuNom];
    return (
      nom !== undefined &&
      nomSensible(nom) &&
      valeurPlausiblementSecrete(valeur, nomDEnvironnement(nom))
    );
  };

  bornes.push(...bornesDuGroupe(texte, PARAM_URL, 3, (v, e) => nommeEtPlausible(v, e, 2)));

  for (const groupe of [2, 3, 4]) {
    bornes.push(
      ...bornesDuGroupe(texte, AFFECTATION_ENV, groupe, (v, e) => nommeEtPlausible(v, e, 1)),
    );
  }

  for (const groupe of [3, 4]) {
    bornes.push(
      ...bornesDuGroupe(texte, AFFECTATION_OBJET, groupe, (valeur, entier) => {
        const nom = entier[1] ?? entier[2];
        if (nom === undefined || DEJA_TRAITES.has(normaliser(nom))) return false;
        return nomSensible(nom) && valeurPlausiblementSecrete(valeur, nomDEnvironnement(nom));
      }),
    );
  }

  return decouper(texte, bornes, (valeur) =>
    CLE_PRIVEE_TEST.test(valeur) ? masquerBlocPem(valeur) : masquer(valeur),
  );
}

/** Reconnaît un bloc PEM déjà borné, pour lui donner son masque dédié. */
const CLE_PRIVEE_TEST = /^-----BEGIN[^-]*PRIVATE KEY-----/u;

/**
 * Masque une clé privée SANS changer le nombre de lignes.
 *
 * Un bloc PEM est le seul secret qui s'étend sur plusieurs lignes. L'écraser
 * en une seule ligne — ce que faisait l'ancienne version — décale tout le
 * fichier à partir de là. C'est exactement la corruption qu'on vient de
 * refermer, et elle ne redevient pas acceptable sous prétexte que le secret,
 * lui, est vrai : un agent qui lit ce fichier doit garder des numéros de ligne
 * justes.
 *
 * On garde donc les bornes du bloc, on remplace CHAQUE ligne du corps par
 * `***`, et le compte de lignes est inchangé — invariant tenu, secret parti.
 */
function masquerBlocPem(bloc: string): string {
  const lignes = bloc.split("\n");
  if (lignes.length <= 2) return "-----BEGIN PRIVATE KEY----- *** -----END PRIVATE KEY-----";
  const premiere = lignes[0] ?? "";
  const derniere = lignes.at(-1) ?? "";
  const corps = lignes.slice(1, -1).map(() => "***");
  return [premiere, ...corps, derniere].join("\n");
}
