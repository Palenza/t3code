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
  for (let taille = 1; taille <= Math.min(2, segments.length - 1); taille += 1) {
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
  /\b([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s;&|]+))/gu;

/** `"clé": "valeur"` en JSON, `clé: valeur` en YAML. */
const AFFECTATION_OBJET =
  /(?:"([A-Za-z_][A-Za-z0-9_-]*)"|\b([A-Za-z_][A-Za-z0-9_-]*))\s*:\s*(?:"([^"\n]*)"|([^\s,}\n]+))/gu;

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
const EN_TETE_AUTH = /\b(authorization|proxy-authorization)\s*:\s*(\S+)(\s+\S+)?/giu;

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
  let sortie = texte.replaceAll(
    CLE_PRIVEE,
    "-----BEGIN PRIVATE KEY----- *** -----END PRIVATE KEY-----",
  );

  for (const motif of JETONS) {
    sortie = sortie.replaceAll(motif, (trouve) => masquer(trouve));
  }

  // Le mot de passe d'une URL. APRÈS la passe JETONS, et sans jamais la
  // repasser : un `ghp_…` en position mot de passe a déjà été masqué en
  // gardant sa tête reconnaissable — la retoucher détruirait précisément ce
  // qu'elle avait choisi de garder. D'où le refus des valeurs portant `***`.
  sortie = sortie.replaceAll(MOT_DE_PASSE_URL, (entier, avant: string, motDePasse: string) =>
    motDePasse.includes("***") ? entier : `${avant}:***@`,
  );

  // L'en-tête d'autorisation garde son SCHÉMA : savoir que c'est un Bearer
  // plutôt qu'un Basic est utile pour déboguer, et ne révèle rien.
  //
  // `MARQUE` est là parce que la passe des affectations qui suit voit
  // `Authorization: Bearer` comme un couple clé/valeur et masquait « Bearer »
  // à son tour — le journal rendait alors « Authorization: *** opaqu***2345 »,
  // où l'on avait perdu le schéma ET gardé le secret masqué deux fois.
  sortie = sortie.replaceAll(EN_TETE_AUTH, (entier, nom: string, un: string, deux?: string) =>
    deux === undefined ? `${nom}: ${masquer(un)}` : `${nom}: ${un} ${masquer(deux.trim())}`,
  );

  sortie = sortie.replaceAll(PARAM_URL, (entier, sep: string, nom: string, valeur: string) =>
    nomSensible(nom) ? `${sep}${nom}=${masquer(valeur)}` : entier,
  );

  const masquerAffectation = (entier: string, nom: string, valeur: string | undefined) => {
    if (valeur === undefined || valeur.length === 0) return entier;
    if (DEJA_TRAITES.has(normaliser(nom))) return entier;
    if (!nomSensible(nom)) return entier;
    // Déjà caviardé par une passe précédente : y retoucher détruirait ce
    // qu'elle avait délibérément gardé (la tête d'une clé reconnaissable).
    if (valeur.includes("***")) return entier;
    return entier.replace(valeur, masquer(valeur));
  };

  sortie = sortie.replaceAll(
    AFFECTATION_ENV,
    (entier, nom: string, guillemets?: string, apostrophes?: string, nu?: string) =>
      masquerAffectation(entier, nom, guillemets ?? apostrophes ?? nu),
  );

  sortie = sortie.replaceAll(
    AFFECTATION_OBJET,
    (entier, cite?: string, nu?: string, valeurCitee?: string, valeurNue?: string) =>
      masquerAffectation(entier, cite ?? nu ?? "", valeurCitee ?? valeurNue),
  );

  return sortie;
}
