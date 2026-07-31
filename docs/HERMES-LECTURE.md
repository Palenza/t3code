# Ce que la lecture du code d'Hermès a donné

> Digest des fichiers lus dans `~/.hermes/hermes-agent`, chaîne par chaîne.
> **Écrit sur disque à dessein** : lire 4 000 lignes dans le contexte les perd
> au prochain compactage (mesuré le 31/07 : 98 % jeté, trois messages
> survivent). Ce fichier, lui, reste.
>
> On y note trois choses seulement : **ce qu'on prend**, **ce qu'on ne prend
> pas et pourquoi**, et **les pièges qu'ils ont payés**.

---

## Chaîne C · le droit d'agir

### n°13 · `tools/threat_patterns.py` (284 l.) — ✅ pris

36 motifs, organisés par CLASSE D'ATTAQUE. Trois portées : `all`, `context`,
`strict`. **La portée est l'idée centrale** — détecter large partout, ne
bloquer que là où l'humain peut intervenir.

**Le piège qu'ils documentent** : ne jamais ancrer sur de l'anglais impératif.
« you must » est trop courant dans un fichier d'instructions légitime. Chez
nous c'est pire (la LOI est faite d'impératifs) — testé, zéro faux positif.

**Le remplissage borné** `(?:\w+\s+){0,8}` : contre le contournement par mots
glissés, ET contre le ReDoS. Un `*` y serait un déni de service offert.

### n°13b · `tools/tirith_security.py` (871 l.) — ⏸️ écarté pour l'instant

Ce n'est pas un scanner, c'est un **enrobage autour d'un binaire tiers**
(Tirith) : installation, vérification cosign, limites de plantage, TTL de
marqueur. Prendre ça, c'est prendre une dépendance externe et sa chaîne
d'approvisionnement. À rouvrir seulement si on décide d'adopter Tirith.

### n°11 · `tools/approval.py` (4 131 l.) + `write_approval.py` (493 l.)

Ce qui vaut le détour, c'est la **table des cibles sensibles**, pas le code :
`_SSH_SENSITIVE_PATH`, `_CREDENTIAL_FILES`, `_SHELL_RC_FILES`,
`_MACOS_PRIVATE_SYSTEM_PATH`, `_SYSTEM_CONFIG_PATH`, et la distinction
`_USER_SENSITIVE_WRITE_TARGET` / `_PROJECT_SENSITIVE_WRITE_TARGET`.

`write_approval.py` porte une idée séparée et bonne : une **écriture en
attente** (`stage_write`, `list_pending`, `discard_pending`) avec un `GateDecision`
et un `skill_pending_diff`. C'est le mécanisme qui rend l'approbation possible
sans bloquer le tour.

### n°12 · `hermes_cli/approvals_suggest.py` (482 l.)

Mine l'historique des approbations pour proposer des règles. La donnée qui
compte : `_UNSAFE_CLASS_PATTERNS` — ce qui ne doit **jamais** être proposé à
l'autorisation automatique, même si l'humain l'a approuvé dix fois.

### n°14 · `tools/url_safety.py` (862 l.) — ✅ la pépite de la chaîne

Protection SSRF. Trois niveaux, et la nuance est ce qui compte :

|                     | quoi                                                                                              | traitement                                    |
| ------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **toujours bloqué** | `169.254.0.0/16` entier, `metadata.google.internal`, `100.100.100.200` (Alibaba), `fd00:ec2::254` | jamais une cible légitime                     |
| **sous bascule**    | privé / localhost                                                                                 | un serveur de dev est légitime                |
| **signalé**         | 20 noms de paramètres sensibles dans l'URL (`token`, `api_key`, `x-amz-signature`…)               | un secret dans une URL fuit dans l'historique |

**Trois pièges non évidents, payés par eux :**

1. **Les variantes IPv4-mappées** `::ffff:169.254.169.254` — un résolveur DNS
   peut les rendre, et `ipaddress` ne les considère PAS égales à l'IPv4.
   Une liste qui ne les contient pas est contournable en une ligne.
2. **`100.64.0.0/10` (CGNAT, RFC 6598)** n'est ni `is_private` ni `is_global` :
   il faut le nommer explicitement. **Chez nous la règle S'INVERSE** — T3 a un
   paquet Tailscale, et Tailscale VIT dans cette plage. C'est du légitime.
3. `_MAX_SSRF_CONNECT_IPS = 8` — on borne le nombre d'IP qu'un nom peut
   résoudre, sinon un DNS hostile fait boucler la vérification.

### n°15 · `tools/osv_check.py` (169 l.)

Court et net : une requête à l'API OSV pour savoir si un paquet est connu
comme malveillant. Utile au moment d'installer une extension MCP.

### n°18 · `tools/credential_files.py` (525 l.) — ❌ LE CATALOGUE SE TROMPAIT

Le catalogue disait « permissions des fichiers de credentials vérifiées ». La
vraie docstring : _« File passthrough registry for remote terminal backends »_
— c'est un registre de MONTAGE de fichiers dans des conteneurs distants.
Aucun rapport, et sans objet chez nous : T3 n'a pas de terminal en conteneur
distant. **Entrée du catalogue corrigée.**

### n°19 · `agent/shell_hooks.py` (929 l.)

Allowlist `(événement, commande)` avec consentement à la première utilisation,
`shell=False` + `shlex.split` (injection impossible), timeouts bornés
(`DEFAULT_TIMEOUT_SECONDS`, `MAX_TIMEOUT_SECONDS`), et — le détail qui compte —
`script_mtime_iso` + `script_is_executable` : **l'autorisation porte sur le
contenu du script au moment où on l'a lue**, pas sur son nom. Un script
autorisé puis modifié redemande le consentement.
