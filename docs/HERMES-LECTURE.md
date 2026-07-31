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

---

## Ce que l'INTERFACE d'Hermès Desktop 0.19.0 apprend (captures du 31/07)

Le code Python ne montre pas les **valeurs par défaut**. Les réglages, si — et
ce sont de la donnée, donc on leur fait confiance (règle de confiance).

Poids du projet, pour situer : **223 000 étoiles, 42 900 forks,
2 200 contributeurs, 19 651 commits, 1 400 branches, 23 releases**, des
commits qui tombent à la minute. Python 76,5 % / TypeScript 20,6 %, MIT.

### 🔴 LA TROUVAILLE — leur compression n'a rien à voir avec la nôtre

`Memory & Context` :

|                         | Hermès                       | Claude Code (mesuré le 31/07)           |
| ----------------------- | ---------------------------- | --------------------------------------- |
| seuil de déclenchement  | **0,6** (60 % de la fenêtre) | ~100 %                                  |
| cible après compression | **0,2** (20 %)               | **1,7 %** (17 k sur 1 M)                |
| messages protégés       | **30**                       | **3**                                   |
| moteur                  | `Compressor`, réglable       | imposé                                  |
| coût                    | continu, invisible           | **2 à 3 min de gel**, 9 fois en 7 jours |

Ils compressent TÔT et SOUVENT ; on subit TARD et BRUTALEMENT. Dix fois plus
de messages gardés, et pas de falaise.

**Et c'est atteignable chez nous** — les trois pièces existent :

- le SDK expose `isAutoCompactEnabled` (`ClaudeAdapter.ts:510`) ;
- T3 connaît le remplissage EN DIRECT (`thread.token-usage.updated`) ;
- le texte du prompt part verbatim au CLI, donc `/compact` est envoyable.

Déclencher à 60 % au lieu d'attendre 100 % supprimerait la falaise et les
22 minutes d'attente hebdomadaires. **Changement de comportement de la boucle
→ palier D2, à montrer avant de déployer.**

### Autres réglages, en donnée brute

`Advanced` — Terminal Output Limit **150 000** (notre `PLAFOND_SORTIE` est à
120 000 : même ordre, mesuré indépendamment). File Page Limit 2 000, Line
Length Limit 2 000, Checkpoint Limit 20, **Max Agent Steps 120**, API Retries
5, **Subagent Turn Limit 80**, **Parallel Subagents 5**, Subagent Reasoning
Effort `Ultra`, Command Timeout 250. Et `In-App Update Local Changes: Stash` —
une mise à jour depuis l'app remise les édits locaux plutôt que de les jeter.

`Safety` — Approval Mode, Approval Timeout 60, **Redact Secrets**, **Allow
Private URLs** + **Browser Private URLs** + **Local Browser For Private URLs**
(trois bascules distinctes : ça confirme le découpage du n°14 — le privé est
permis SOUS BASCULE, le lien-local jamais), **File Checkpoints** (« rollback
snapshots before file edits »).

`Notifications` — 6 catégories séparées : approbation, saisie, réponse prête,
tour échoué, **tâche de fond terminée**, alertes de crédit. Plus un **son de
fin** avec préréglages et prévisualisation. Et la phrase qui compte :
_« Completion alerts only fire while Hermes is in the background. »_ C'est mot
pour mot la demande du fondateur (consigne globale : « un toast dans une
fenêtre que tu ne regardes pas ne sert à rien »).

`Voice` — TTS parmi 10 fournisseurs dont **Piper local** (`fr_FR-siwis-medium`
chez lui), STT `Local` par défaut avec Whisper Tiny→Large-V3, langue `fr`,
raccourci `ctrl+b`, écho des transcriptions.

`Gateway` — quatre modes : Local / Cloud / Distant / **par SSH** (« Hermes est
lancé sur la machine distante et tunnelé jusqu'à l'app »).

`Advanced` — **Quick Entry** : un compositeur global invoqué au raccourci
clavier, sans ouvrir l'app. T3 n'a pas d'équivalent.

`Archived Chats` — auto-archivage des fils dormants, avec exactement la
doctrine du curateur : _« Pinned chats are never archived, and nothing is
deleted — archived chats just move here. »_

`About` — désinstallation à **trois granularités** (GUI seule / GUI+agent en
gardant les données / tout), et la bannière de mise à jour affiche la branche
et le commit.

### Ce que T3 n'a PAS, vérifié

|                                      | T3                          |
| ------------------------------------ | --------------------------- |
| seuil de compression réglable        | ❌                          |
| auto-archivage des fils dormants     | ❌                          |
| Quick Entry (raccourci global)       | ❌                          |
| modes de connexion de passerelle     | ❌                          |
| notification quand l'app est en fond | ✅ (`VeilleFinDeTache.tsx`) |

### Deux détails de leur dépôt qui parlent

- `native/fts5_cjk` est bien là, avec son commit « CJK-bigram index » — c'est
  le n°6, et il se copie.
- `optional-skills` porte un correctif : _« stop shredding an existing
  MEMORY.md »_. Leur CLI a détruit des MEMORY.md d'utilisateurs. À se rappeler
  au moment de toucher à la mémoire.
