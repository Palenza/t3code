/**
 * UNE VALEUR RESSEMBLE-T-ELLE À UN SECRET ?
 *
 * La question que le caviardage ne posait pas — et c'est ce qui l'a rendu
 * destructeur. Il masquait sur le seul NOM du champ : une clé s'appelant
 * `token`, `auth` ou `secret` faisait masquer sa valeur, quoi qu'elle
 * contienne.
 *
 * Mesuré le 03/08 sur le dépôt lui-même, qui ne contient AUCUN secret :
 * 800 fichiers sur 15 255 altérés (5,2 %), 459 lignes PERDUES, 9 509 modifiées.
 * Les cas les plus parlants :
 *
 *     id-token: none            →  id-token: ***
 *     token: ${{ secrets.X }}   →  token: *** secrets.X }}
 *     Authorization: mcpSession.authorizationHeader
 *
 * Aucun des trois n'est un secret : un mot-clé de configuration, une
 * interpolation qui NOMME un secret sans le contenir, un identifiant de code.
 * Les masquer ne protégeait rien et corrompait la matière que les agents
 * lisent.
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 *
 * Le nom est un INDICE, jamais un verdict. Pour qu'une valeur soit masquée sur
 * la foi de son nom, elle doit AUSSI être opaque : ni un mot du langage de
 * configuration, ni une expression de code, ni une interpolation, ni un
 * chemin — et porter assez d'entropie pour qu'un secret soit crédible.
 *
 * Les jetons à préfixe connu (`sk-ant-…`, `ghp_…`) ne passent PAS par ici :
 * ils se reconnaissent seuls, où qu'ils soient, et ce module ne peut pas les
 * affaiblir.
 *
 * Module PUR. Le sens de l'erreur est choisi : dans le doute, on NE masque
 * PAS. Un garde qui abîme la matière se fait débrancher, et un garde débranché
 * ne protège plus rien — tandis qu'un secret manqué reste attrapable par la
 * passe des préfixes, qui elle ne se trompe pas.
 */

/**
 * Les mots que la configuration emploie comme VALEURS.
 *
 * `id-token: none` dans un workflow GitHub, `auth: false`, `token: inherit` :
 * ce sont des réglages, pas des secrets. Les masquer casse le fichier ET
 * n'apporte rien.
 */
const MOTS_DE_CONFIGURATION = new Set([
  "none",
  "null",
  "nil",
  "true",
  "false",
  "yes",
  "no",
  "on",
  "off",
  "auto",
  "default",
  "inherit",
  "write",
  "read",
  "read-all",
  "write-all",
  "required",
  "optional",
  "always",
  "never",
  "undefined",
  "empty",
  "disabled",
  "enabled",
  "bearer",
  "basic",
  "digest",
  "token",
  "secret",
]);

/**
 * Les valeurs qui ANNONCENT un secret sans en contenir un.
 *
 * `${{ secrets.EXPO_TOKEN }}`, `$ANTHROPIC_API_KEY`, `<your-token>` : le
 * fichier dit « le secret va ici ». Le masquer détruit l'information sans
 * protéger quoi que ce soit — le secret, lui, n'a jamais été là.
 */
const INTERPOLATION = /\$\{|\$\(|\{\{|%\(|^\$[A-Za-z_]|<[^>]*>|^%[A-Za-z_]+%$/u;

/** Une expression de code : `mcpSession.authorizationHeader`, `process.env.X`. */
const EXPRESSION_DE_CODE = /^[A-Za-z_$][A-Za-z0-9_$]*(?:[.[][A-Za-z0-9_$\]"']+)+$/u;

/**
 * Un identifiant nu : `authorizationHeader`, `myToken`. Du code, pas un secret.
 *
 * ⚠️ MAIS un secret aléatoire est ALPHANUMÉRIQUE LUI AUSSI. Écrit sans nuance,
 * ce rejet laissait passer `client_secret: "aB3dEf9hIjK2lMnOpQ4rStUvW6xYz8A1"`
 * — 32 caractères de hasard, indiscernables d'un nom de variable pour une
 * expression régulière de forme. Trouvé par le banc, pas par la relecture.
 *
 * Le vrai discriminant n'est pas la FORME, c'est la LONGUEUR et le DÉSORDRE.
 * Un identifiant écrit par un humain reste court et se prononce à peu près ;
 * au-delà de `LONGUEUR_IDENTIFIANT_CREDIBLE` caractères sans le moindre
 * séparateur, personne n'écrit ça à la main.
 */
const IDENTIFIANT_NU = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

/** Au-delà, une suite alphanumérique n'est plus un nom écrit par un humain. */
export const LONGUEUR_IDENTIFIANT_CREDIBLE = 24;

/** Un chemin de fichier, absolu ou relatif. */
const CHEMIN = /^(?:[~.]{0,2}\/|[A-Za-z]:\\)/u;

/**
 * La ponctuation qu'un secret ne porte JAMAIS, et que le code porte toujours.
 *
 * Les motifs d'affectation ont été écrits pour `.env` et le shell. Appliqués à
 * du TypeScript, ils voient `const token = Encoding.encodeHex(bytes);` comme
 * un couple clé/valeur. Un jeton opaque ne contient ni parenthèse, ni
 * point-virgule, ni accolade : ce seul test a fait tomber la quasi-totalité
 * des faux positifs restants.
 */
const PONCTUATION_DE_CODE = /[();{}<>,?]/u;

/**
 * Un slug lisible : `one-time-cloud-credential`, `unrelated-payload-secret`.
 *
 * Trois morceaux ou plus, séparés par des tirets ou des soulignés, tous en
 * lettres pures : c'est une phrase écrite par un humain. Un secret n'a pas de
 * mots. Sans ce test, toute constante de test un peu longue se faisait
 * caviarder — et un fichier de test corrompu est aussi grave qu'un fichier de
 * code corrompu, parce qu'il devient un golden faux.
 */
const SLUG_LISIBLE = /^[A-Za-z]+(?:[-_][A-Za-z]+){2,}$/u;

/** Ce qu'on a déjà masqué, ou ce qui n'a jamais été rempli. */
const DEJA_MASQUE = /\*{3}|^x{3,}$|^\.{3}$/iu;

/** Longueur minimale plausible pour un secret. En-dessous, c'est un réglage. */
export const LONGUEUR_MINIMALE = 12;

/** Compte les familles de caractères présentes : minuscules, majuscules, chiffres, symboles. */
function famillesPresentes(valeur: string): number {
  let familles = 0;
  if (/[a-z]/u.test(valeur)) familles += 1;
  if (/[A-Z]/u.test(valeur)) familles += 1;
  if (/[0-9]/u.test(valeur)) familles += 1;
  if (/[^A-Za-z0-9]/u.test(valeur)) familles += 1;
  return familles;
}

/**
 * `true` si cette valeur peut CRÉDIBLEMENT être un secret.
 *
 * Un mot de passe faible ne passera pas ce filtre — c'est assumé. Le rôle de
 * ce module est d'empêcher la destruction de matière saine ; les secrets à
 * forme reconnaissable sont attrapés ailleurs, par leur préfixe, sans passer
 * par le nom du champ.
 */
/**
 * Un nom de variable d'ENVIRONNEMENT qui désigne un secret sans ambiguïté :
 * `ANTHROPIC_API_KEY`, `R2_SECRET_ACCESS_KEY`. En majuscules et soulignés,
 * c'est de la CONFIGURATION — sa valeur EST le secret, quelle que soit sa
 * forme.
 *
 * La distinction tranche un conflit réel, vu sur le banc : la même chaîne
 * `xxx-yyy-zzz` doit être masquée derrière `ANTHROPIC_API_KEY=` et laissée
 * intacte derrière `const secret =`. Le nom décide, parce que lui seul dit si
 * on lit un fichier de configuration ou du code source.
 */
export function nomDEnvironnement(nom: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/u.test(nom.trim()) && nom.includes("_");
}

export function valeurPlausiblementSecrete(valeur: string, nomFort = false): boolean {
  const propre = valeur.trim();
  if (propre.length < LONGUEUR_MINIMALE) return false;
  if (DEJA_MASQUE.test(propre)) return false;
  if (MOTS_DE_CONFIGURATION.has(propre.toLowerCase())) return false;
  if (INTERPOLATION.test(propre)) return false;
  if (CHEMIN.test(propre)) return false;
  if (PONCTUATION_DE_CODE.test(propre)) return false;
  // Sous un nom d'environnement, la FORME de la valeur ne disculpe plus : un
  // secret peut parfaitement ressembler à des mots. Les exemptions qui suivent
  // servent à protéger du CODE SOURCE, et le code source n'a pas de variables
  // en majuscules avec des soulignés.
  if (!nomFort && SLUG_LISIBLE.test(propre)) return false;
  if (!nomFort && EXPRESSION_DE_CODE.test(propre)) return false;
  // L'identifiant ne disqualifie que s'il est CRÉDIBLE comme nom écrit à la
  // main : court, ou porteur de séparateurs. Une longue suite alphanumérique
  // d'un seul tenant est un secret, pas une variable.
  if (
    !nomFort &&
    IDENTIFIANT_NU.test(propre) &&
    (propre.length < LONGUEUR_IDENTIFIANT_CREDIBLE || propre.includes("_"))
  ) {
    return false;
  }
  // De la prose : un secret ne contient pas d'espaces internes. « Bearer abc »
  // est déjà découpé par la règle d'en-tête ; ici, un espace signale une phrase.
  if (/\s/u.test(propre)) return false;
  // De l'entropie, enfin. Trois familles suffisent sur une chaîne courte ;
  // au-delà de 24 caractères, deux suffisent (beaucoup de jetons sont en
  // hexadécimal ou en base32, donc pauvres en familles mais longs).
  const familles = famillesPresentes(propre);
  if (familles >= 3) return true;
  return propre.length >= 24 && familles >= 2;
}
