# Chantier Hermès — ce qu'on prend, et où on en est

Issu de l'inventaire exhaustif de `NousResearch/hermes-agent` (agent/ 120 f.,
tools/ 110, hermes_cli/ 185, gateway/ 56, cron/ 9) confronté à T3 Code Raptor.

**Le cadre.** On garde notre moteur : le SDK `@anthropic-ai/claude-agent-sdk`
et les comptes Max personnels en rotation (`comptePool`). On ne prend donc
**rien** de leur couche d'inférence — ni adaptateurs de fournisseur, ni
économie de tokens facturés. On prend tout ce qui vit **autour**, et c'est là
qu'est l'essentiel de leur valeur.

**Pourquoi ce fichier existe.** Les 85 chantiers ont vécu une journée entière
dans une conversation, donc dans quelque chose qui se compacte. A6 : l'écrit
survit, le retenu meurt. Un plan qu'on ne peut pas relire demain n'est pas un
plan.

## Où en est le catalogue — au 01/08/2026

**34 livrés · 3 partiels · 21 écartés sur pièce · 27 restants.**

Chaque ligne a été INSTRUITE : aucune n'est restée sans qu'on aille voir. Un
écart porte toujours sa raison, et une raison porte un reçu quand elle repose
sur une mesure.

Ce que les 27 restants attendent vraiment — c'est la seule question utile :

|       | quoi                                                                     | qui décide                                                                                                                         |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **8** | la passerelle 38→45 (Telegram, Discord, Slack)                           | **Enzo** — décision de produit. Vérifié : elles n'attendent AUCUN maillon technique, le bail de tour est un problème qu'on n'a pas |
| **5** | surfaces 64-67, 69 (computer use, mot d'éveil, TTS, kanban, image/vidéo) | **Enzo** — vision produit, et le kanban fait 10 010 l.                                                                             |
| **3** | l'installation de skills 51→53                                           | **Enzo** — écrire dans le home Claude se décide                                                                                    |
| **2** | habillage 79-80 (onboarding, achievements)                               | **Enzo** — goût et ton de marque                                                                                                   |
| **3** | chantiers à part : 7 (PTC), 28 (LSP), 37 (la passerelle elle-même)       | multi-session, annoncés tels quels                                                                                                 |
| **6** | 3, 6, 8, 12, 54, 71                                                      | bloqués ou instruits, chacun avec son reçu écrit                                                                                   |

Autrement dit : **rien ne reste qui soit à la fois solo, débloqué et non
tranché**. Ce qui reste appartient à Enzo, ou demande sa propre session.

Le plus urgent des six est le **n°71** : notre porte de sortie ne caviarde que
nos 23 outils MCP, jamais les `Bash`/`Read`/`WebFetch` du SDK. Le crochet
existe (`PostToolUse.updatedToolOutput`), le point de câblage est écrit — mais
il remplace la sortie de TOUS les outils, donc il exige une preuve sur un vrai
tour avant de partir (D3).

---

Légende : `[x]` livré (avec son commit) · `[~]` partiellement livré · `[ ]` à faire · `[–]` écarté, avec
la raison — un écart sans raison se rouvre tous les mois.

---

## Niveau 1 — extrêmement fort

- [x] **1 · Le curateur** — la DÉCISION, avec les quatre invariants stricts
      portés tels quels + un cinquième qui est le nôtre : un usage
      `indécidable` (n°2) interdit tout geste. Archive, n'efface jamais.
      `agent/curator.py` (2 019)
      **Volontairement NON branché**, et ce n'est pas un oubli : mesuré le
      01/08, la projection ne couvre que **7,3 jours** (60 831 activités,
      élaguée). Le curateur répondrait `indécidable` sur toute skill plus
      vieille — c'est-à-dire presque toutes. Lui donner une bouche
      maintenant, ce serait livrer un outil qui ne sait rien dire. Il attend
      une fenêtre d'observation, pas du code.
      _(reste : la REVUE elle-même sur modèle auxiliaire — routage
      `modules/ai` — et l'instantané avant mutation de `curator_backup.py`.)_
- [x] **2 · Télémétrie de skills** — 3 états + `pinned` orthogonal. Deux
      écarts assumés avec Hermès : **aucun sidecar** (il déclencherait un
      `reloadSkills()` par tour via `signatureDesSkills`) et **aucune
      instrumentation** (T3 persiste déjà chaque appel). Le verdict porte sa
      FENÊTRE : sur les 7,1 j observés, 0 archivable sur 17.
      `tools/skill_usage.py` (1 145)
- [ ] **3 · Graphe d'apprentissage** — mutations tracées, rendu visuel, frise
      `/journey`. `agent/learning_graph.py`, `learning_graph_render.py`,
      `learning_mutations.py`, `hermes_cli/journey.py`
      **Bloqué en CHAÎNE, et la racine est mesurée (01/08).** Ce chantier
      enregistre les MUTATIONS de skills — qui a changé quoi, quand, pourquoi.
      Or personne ne mute encore : le curateur (n°1) décide et n'applique
      rien, parce qu'il attend une fenêtre d'observation (la projection ne
      couvre que 7,3 jours). Le graphe d'un ensemble vide est une page
      blanche.
      La racine n'est donc pas du code manquant, c'est du TEMPS : il faut que
      la projection couvre la vie des skills. Rien à construire d'ici là.
- [x] **4 · Les NORMES d'une skill** — leur `_AUTHORING_STANDARDS` porté non
      pas en prompt mais en CONTRÔLE : un prompt est un espoir, un contrôle est
      un fait, et il s'applique aussi aux skills déjà écrites. Seuil de
      description à 240 (le leur, 60, vient de LEUR troncature ; le nôtre vient
      de notre mesure). `agent/learn_prompt.py` (150)
      **Branché le 01/08** : outil MCP `normes-skills`. C'était tout l'intérêt
      du chantier qui se perdait — un contrôle qu'on ne lance jamais n'est
      qu'un prompt de plus, en moins visible. Reçu au branchement, sur les 18
      skills réelles de Palenza : **15 dépassent les 240 caractères** (jusqu'à
      895), ~8 400 caractères chargés à chaque session.
      _(reste : la fabrication elle-même — depuis un dossier, une URL, la
      conversation. Elle a besoin d'un tour de modèle, pas d'un module pur.)_
- [x] **5 · Recherche FTS dans toutes les conversations** — 3 modes déduits
      des arguments, coût LLM zéro, fenêtre ±5, bornes de fil, un résultat par
      fil. `tools/session_search_tool.py` (1 142)
      → `5dcdc8647`, plafonds mesurés dans `71c1d7b38`
- [ ] **6 · Tokenizer CJK** — **MESURÉ le 01/08, et le chantier a changé de
      taille.** Il n'y a pas de C à écrire pour l'essentiel : le SQLite
      embarqué de Node porte déjà le tokenizer `trigram`. Relevé sur la vraie
      base en mémoire, avec nos réglages actuels (`unicode61
remove_diacritics 2`) contre `trigram` :

                    requête      unicode61 (le nôtre)   trigram
                    数据  (2)          0                   0
                    数据库 (3)          0                   1
                    東京  (2)          0                   0
                    chat               1                   1
                    dort               1                   1

                Donc **notre index ne trouve JAMAIS rien en CJK**, pas même sur trois
                caractères — ce n'est pas une dégradation, c'est un mur. `trigram` le
                lève dès 3 caractères sans toucher au français.
                Reste hors de portée : les termes CJK de **1-2 caractères**, et c'est
                précisément ce que leur bigramme compilé existe pour couvrir.
                **On ne bascule PAS aujourd'hui** : produit français d'abord, un index
                trigramme pèse plus lourd (une entrée par fenêtre de 3), et personne
                n'attend cette recherche. Mais le jour où un utilisateur CJK arrive, la
                décision est un MOT dans la migration 036 — plus un chantier natif.
                `native/fts5_cjk/` **(copie C, désormais optionnelle)**

- [ ] **7 · PTC — appel d'outils programmatique** — le modèle écrit un script
      qui appelle nos outils, N tours → 1. Seul le `stdout` revient. Chez nous il
      passe par notre serveur MCP, pas par un socket Unix.
      `tools/code_execution_tool.py` (2 014)
- [ ] **8 · `/goal` — la boucle Ralph** — juge après chaque tour, continuation
      = message normal (cache intact), juge fail-OPEN, message utilisateur
      préempte, survit au `/resume`. `hermes_cli/goals.py` (1 807)
      **Instruit le 01/08**, comme le triage le demandait, et le résultat
      ouvre la voie plutôt que de la fermer : T3 n'a AUCUN `/goal` à lui
      (recherche dédiée), et le SDK n'en expose pas non plus — ni option, ni
      sous-type de commande. La boucle qu'on utilise aujourd'hui est celle du
      CLI Claude Code, hors du chemin que T3 pilote.
      Donc un `/goal` de T3 ne doublerait rien. Il reste à vérifier une chose
      qui ne se voit pas d'ici : si le CLI que le SDK lance expose déjà la
      commande à ses utilisateurs. **À demander à Enzo** — invérifiable depuis
      le dépôt (A1).
- [x] **9 · Nudges de persistance** — la DETTE DE PERSISTANCE : combien de
      tours et d'outils depuis la dernière écriture de fichier. Fil-piège
      MESURÉ (p95 = 9 tours, p99 = 22 → seuil 12 tours ET 40 outils : 2 séries
      sur 89). Ne crie pas au loup — 56 % des tours n'écrivent rien, et une
      enquête de neuf tours reste normale. `agent/memory_manager.py` (1 241)
      _(reste : l'injection AUTOMATIQUE dans le tour, qui touche l'adaptateur
      — palier D2. L'outil `dette` est appelable dès maintenant.)_

## Niveau 2 — très bon · sécurité et secrets

- [x] **10 · Scanner de skills importées** — la FORME (binaire embarqué,
      50 fichiers, caractères invisibles) autant que le contenu, plus la
      MATRICE de politique : le même danger décide autrement selon la source.
      Réutilise la bibliothèque du n°13 en portée `strict`.
      `tools/skills_guard.py` (1 153, 121 motifs)
      **Branché le 01/08** : outil MCP `inspecter-skill`. Le scanner était
      complet, testé, et n'avait jamais vu un seul fichier — un garde sans
      porte à garder.
- [x] **11 · Cibles sensibles** — la table de `approval.py` aspirée : ce qui
      est DANS l'espace de travail n'est pas ordinaire pour autant. `.git/`
      refusé (un hook s'exécute au commit, `core.pager` est une commande) ;
      `.env`, les réglages et hooks de l'agent, les identifiants de paquets
      sont ÉCRITS mais DITS. `tools/approval.py` (4 131)
      _(reste : l'approbation interactive elle-même — un LLM auxiliaire qui
      auto-approuve le faible risque, et la mise en attente d'écriture de
      `write_approval.py`. Palier D2.)_
- [ ] **12 · Suggestions d'allowlist** — l'agent propose ce qu'il faudrait
      autoriser. `hermes_cli/approvals_suggest.py`
      **Bloqué, avec son reçu (01/08).** Ce chantier MINE un historique
      d'approbations. La table existe — `projection_pending_approvals`
      (request_id, status, decision, resolved_at) — et elle contient
      **0 ligne** sur cette machine. Il n'y a rien à miner : les suggestions
      sortiraient d'un ensemble vide, ce qui n'est pas une suggestion, c'est
      une invention. Rouvrir quand la table se remplit.
- [x] **13 · Patterns de menace** — les 36 motifs d'Hermès portés en DONNÉE,
      par classe d'attaque, avec leurs trois PORTÉES (partout / contexte /
      strict) : détecter large partout, ne bloquer que là où l'humain peut
      intervenir. Branché sur la porte de sortie (I2). Testé que notre propre
      LOI ne les déclenche pas. `threat_patterns.py` (284)
      _(reste : le scan PRÉ-EXÉCUTION de `tirith_security.py` (871), qui
      appartient au n°11)_
- [x] **14 · Sûreté d'URL** — SSRF. Le lien-local `169.254.0.0/16` et les
      points de métadonnées de cloud sont TOUJOURS refusés ; `localhost` et le
      privé restent permis (voir son serveur de dev est le produit). Branché
      sur `preview_navigate` et `preview_open`. `tools/url_safety.py` (862)
      _(reste : `website_policy.py`, la liste de sites par configuration)_
- [x] **15 · Contrôle anti-malware sur les paquets** — le catalogue disait
      « vérification CVE/OSV ». En lisant le code, ce n'en est PAS une : ils
      ignorent délibérément les CVE et ne regardent que les avis `MAL-*`. Une
      CVE dans une dépendance est un risque qu'on arbitre ; un paquet
      malveillant est du code hostile qu'on exécute. Confondre les deux donne
      une alerte qui crie sur la moitié de npm, donc une alerte qu'on éteint.
      Outil MCP `paquet-malveillant`, moitié pure séparée (`PaquetALancer.ts`).
      Ajouté à leur liste de lanceurs : **`bunx` et `pnpm dlx`** — les nôtres.
      Un contrôle qui ne connaît pas les commandes qu'on tape ne contrôle rien.
      Golden pris sur l'API RÉELLE (`noblox.js-proxy` → `MAL-2022-4874`).
      `tools/osv_check.py` (169)
      _(reste : la porte automatique. Ce qui lance `npx` est le `Bash` du SDK,
      un moteur qu'on ne possède pas — cf. n°25 et n°30. Le jour où T3 tient
      un point de passage sur l'exécution, la moitié pure s'y branche sans
      changer une ligne : c'est pour ça qu'elle est séparée.)_
- [–] **16 · ~~Sources de secrets externes~~** — **Écarté sur enquête,
  01/08.** Leurs 3 231 lignes (1Password, Bitwarden, commande) répondent à
  « où ranger un secret pour qu'il ne traîne pas sur le disque ». On a la
  réponse, et elle est bonne : `ServerSecretStore` sort déjà toute valeur
  `sensitive` de `settings.json` et l'écrit dans un fichier à part. Vérifié
  sur la machine, pas dans le code :

      ~/.t3/userdata/secrets            drwx------  (0700)
      ~/.t3/userdata/secrets/*.bin      -rw-------  (0600)

  Écriture atomique, `chmod` posé sur le fichier TEMPORAIRE avant le rename —
  donc aucune fenêtre où le secret existe en clair lisible. Un coffre externe
  ajouterait « le secret n'est même pas chez nous », ce qui est réel mais
  répond à un vol de disque : pas notre menace sur un poste mono-utilisateur.
  _(À rouvrir si T3 tourne un jour sur une machine partagée.)_
  **Ce que l'enquête laisse quand même sur la table** : leur parseur de sortie
  de commande porte deux gardes non évidents — la clé demandée passe par une
  variable d'environnement et n'est JAMAIS interpolée dans le shell, et une
  sortie `AUTRE_CLE=valeur` n'est pas rendue comme la clé demandée (fuite
  croisée d'identifiants, pas un simple 401). À reprendre tels quels le jour
  où on lira un secret depuis une commande. `agent/secret_sources/` (3 231)

- [x] **17 · Rédaction des secrets** — 985 lignes rien que pour caviarder
      journaux et télémétrie. `agent/redact.py`, `monitoring/redaction.py`
      → `8be2f82c1`, branché à la sortie d'outil dans `422454103`
- [–] **18 · ~~Permissions des credentials~~** — **Écarté, le catalogue se
  trompait** : `credential_files.py` (525 l.) n'est pas un contrôle de
  permissions, c'est un registre de MONTAGE de fichiers dans des
  conteneurs de terminal distants. Sans objet — T3 n'en a pas. Vérifié en
  lisant le fichier.
- [–] **19 · ~~Hooks shell à consentement~~** — **Écarté sur enquête, 01/08.**
  Ce chantier garde un mécanisme que T3 n'a PAS : recherche dédiée faite
  (A3), il n'exécute aucun hook à lui. Les seules occurrences du mot dans le
  dépôt sont dans `CibleSensible.ts` (n°11), qui protège contre l'écriture
  dans les hooks de Claude Code — l'inverse exact. Écrire le consentement
  d'une porte qui n'existe pas obligerait à créer la porte d'abord.
  Les hooks que T3 côtoie sont ceux de Claude Code, qui portent déjà leur
  propre modèle de consentement, et qu'on garde en écriture. `agent/shell_hooks.py`
- [x] **20 · Audit de sécurité au démarrage** — consultatif, jamais bloquant,
      comme le leur. Deux de leurs quatre contrôles ne sont pas notre monde
      (sshd, conteneur) ; on garde root et on ajoute les PERMISSIONS des
      fichiers d'état — qui ont trouvé un vrai défaut dès le premier passage.
      `security_audit_startup.py` (282)
      **Branché le 01/08** dans la construction du serveur. Il journalise et
      ne répare PAS : `clerk-tokens.json` est posé en 0666 par
      `@clerk/electron/storage`, un `chmod` au démarrage serait défait à la
      prochaine écriture de la dépendance — et entre les deux on aurait le
      confort d'avoir corrigé. Resserrer ces modes touche l'authentification,
      donc ça se décide (remonte à Enzo, M2).
      _(reste : les avis poussés de `security_advisories.py` ; et la décision
      sur le mode de `clerk-tokens.json`.)_
- [x] **21 · Sûreté de chemin** — une écriture ne suit plus un lien hors de
      l'espace. `tools/path_security.py`, `agent/file_safety.py`
      → `20212d888` (le chemin de LECTURE était déjà meilleur que le leur)

## Niveau 2 — très bon · qualité de l'agent

- [x] **22 · Preuve de vérification** — l'agent doit PROUVER que ça marche
      avant de dire que c'est fait. `agent/verification_evidence.py`
      → `f60d9192c` (un passage ciblé ne dit plus « tout est vert »), `7cb740610`
- [x] **23 · Garde-fous d'outils + classification de résultat**
      `agent/tool_guardrails.py` → `8bddea2fa`, `0a2dadc7c`
- [x] **24 · Hygiène de contexte** — plafonds de sortie, redaction profonde,
      et DÉBORDEMENT SUR DISQUE : au-dessus du plafond l'intégral part dans un
      fichier et le contexte reçoit une tête + un pointeur. Rien n'est jeté
      (H6). `tools/tool_output_limits.py`, `tool_result_storage.py`
      → `422454103` puis le n°24b
- [–] **25 · Édition de fichiers de qualité** — correspondance floue, parseur
  de patch. **Écarté** : l'édition appartient à Claude Code, pas à T3. La
  reprendre serait doubler un moteur qu'on ne possède pas.
- [–] **26 · ~~Délégation~~** — **Écarté sur enquête, 01/08.** Leurs 3 974
  lignes sont une GOUVERNANCE de la délégation : outils interdits au fils,
  profondeur max (1, plat par défaut), 3 enfants concurrents, pause,
  interruption par identifiant, délai de l'enfant.
  L'essentiel est déjà dans le SDK, qu'on ne possède pas mais qu'on utilise :
  `AgentDefinition` porte `tools`, `disallowedTools`, `maxTurns`, `background`,
  `model`, `skills`, `mcpServers`. Ce sont leurs `DELEGATE_BLOCKED_TOOLS` et
  leur délai, écrits par quelqu'un d'autre.
  Ce qui manque — plafond de profondeur et de concurrence — ne peut pas venir
  de nous : c'est le SDK qui LANCE le sous-agent (même mur que n°25 et n°30).
  Et le gaspillage réel qu'on a mesuré (une veille qui dépensait jusqu'à
  **48 agents**, un par dépôt) est déjà traité, par la skill que T3 dépose
  lui-même dans chaque home — `ClaudeOutillage.ts`.
  _(À rouvrir si le SDK ouvre un point de passage sur le lancement de
  sous-agents. Le jour venu, le plafond de profondeur est une petite tranche.)_
- [x] **27 · Lecture du contexte** — « il te reste 3 tours » au lieu de
      « 83 % ». `agent/iteration_budget.py` → `b0a4cf0d0`
      _(reste : répartition par catégorie, références)_
- [ ] **28 · Client LSP** — l'agent voit le code comme un IDE. Chez nous :
      exposé en outil MCP. `agent/lsp/`
- [–] **29 · ~~Environnements d'exécution~~** — **Écarté sur inventaire,
  01/08.** Leur dossier porte huit environnements : local, ssh, docker,
  modal, managed_modal, daytona, + la synchro de fichiers.
  On en a déjà QUATRE, et ce sont ceux qui comptent pour notre posture :
  **local**, **SSH** (`packages/ssh`), **WSL** (`apps/desktop/src/wsl`), les
  **worktrees**, et un point d'entrée **cloud managé**
  (`cloud/ManagedEndpointRuntime`). Tailscale relie le tout.
  Ce qui manque est exactement la famille « LOUER un bac à sable à un SaaS » —
  Docker distant, Modal, Daytona, Vercel Sandbox. Ce n'est pas un manque
  technique, c'est une autre posture de produit : T3 tourne sur TA machine ou
  sur TA machine distante. Y ajouter de la compute louée engage de l'argent,
  donc ça remonte à Enzo avant d'être un chantier (M2).
- [–] **30 · Registre de processus + pool de démons + interruption** —
  **Écarté sur enquête, 01/08.** Leurs 2 422 lignes lancent, suivent,
  tamponnent, surveillent et tuent des processus d'arrière-plan. Chez nous
  RIEN de ça ne nous appartient : le lancement en arrière-plan est au SDK
  Claude Agent (`run_in_background`, `BashOutput`, `KillShell`), comme la
  boucle d'agent elle-même. Écrire notre registre doublerait un moteur
  qu'on ne possède pas — même verdict que le n°25.
  Mais l'enquête n'a pas été vaine : elle a trouvé **63 processus
  orphelins** sur la machine, tous des fixtures de test à nous, le plus
  vieux vivant depuis 1 j 15 h. La seule idée transférable de leur
  registre est là — quelqu'un doit SURVEILLER ce qu'on a lancé. Corrigé et
  gardé par un test (`e601ec4f3`), pas par un registre.
  `tools/process_registry.py` (2 422), `daemon_pool.py`, `interrupt.py`
- [–] **31 · Profils totalement isolés** — **Écarté pour l'instant** :
  spéculatif. On n'a pas le problème (un seul humain, une seule machine
  principale). _Le garde de changement de contexte, lui, reste à prendre._
- [x] **32 · Migrations de configuration versionnées** — une seule clé cassée
      pouvait effacer les trois comptes Max. `hermes_cli/config_migrations.py`
      → `388526614`
- [x] **33 · Sauvegarde et restauration** — 1,8 Go d'état sans aucun chemin
      de restauration. `hermes_cli/backup.py` (1 726) → `2e56d1ed6`
- [–] **34 · Magasin de checkpoints partagé** — **Écarté** : T3 a déjà le
  shadow-git de cline, avec un `rescueRef` qu'Hermès n'a pas. Voir
  `0d7d1e4ed`.
- [–] **35 · Récupération de session corrompue** — T3 copie les transcripts OCTET PAR OCTET sans les analyser : leur corruption ne nous atteint pas.

- [–] **36 · Robustesse SQLite** — **Écarté** : leur mode de panne
  (verrous POSIX annulés par un `close()` sur n'importe quel fd) nous est
  inaccessible — les scopes de Layer ferment la base, et rien ne sonde le
  fichier directement.

## Niveau 2 — le gateway (en interne, pas en appelant Hermès)

- [ ] **37 · Architecture de passerelle** — continuité de session ENTRE
      plateformes, bail de tour (un seul écrivain), slash universelles.
      `gateway/session.py` (3 307), `turn_lease.py`, `slash_commands.py` (5 483)
      **INSTRUIT le 01/08, et ça change la nature du blocage.** Le triage
      disait « rien ne marche sans le n°37 (bail de tour) ». Vérifié : **le
      bail de tour est un problème qu'on n'a pas.**
      Leur `turn_lease.py` (302 l.) répond à une forme précise : leurs gardes
      d'occupation sont indexés par CLÉ DE ROUTAGE, la transcription durable
      est possédée par SESSION_ID, et `switch_session()` rend le lien
      plusieurs-vers-un. Deux clés sur une session = deux tours concurrents
      qu'aucun garde par clé ne voit, des écritures entrelacées, et un coin
      `user;user` permanent dans la transcription.
      Chez nous, trois choses ferment cette route AVANT qu'elle s'ouvre :
      · `Map<ThreadId, Context>` — un pour un, aucune couche de routage,
      aucun alias ;
      · le dispatch d'orchestration est **sérialisé par file**
      (`OrchestrationEngine.dispatch`) ;
      · le réacteur consomme par `DrainableWorker`, qui prend **un élément à
      la fois** et ne rend la main qu'une fois l'élément terminé.
      Un second `sendTurn` sur le même fil ne peut donc pas s'entrelacer : il
      est traité après, et l'adaptateur en fait un `steer`.
      **Conséquence pour la suite du bloc (38→45)** : ils ne sont PAS bloqués
      par une primitive manquante. Ils attendent une décision de produit —
      faut-il que T3 réponde depuis Telegram ? — et c'est Enzo qui la prend
      (M2 : goût, marque, vision).
- [ ] **38 · Streaming vers les messageries** `stream_consumer.py` (2 250)
- [ ] **39 · Livraison fiable** — ledger, cibles mortes, miroir, caches média
- [ ] **40 · Autorisation par utilisateur et par canal** — appairage,
      `/whoami`. `authz_mixin.py` (838)
- [ ] **41 · SDK d'ajout de plateforme sans toucher au cœur**
      `platform_registry.py` + `ADDING_A_PLATFORM.md`
- [ ] **42 · Telegram d'abord**, puis Discord, Slack, WhatsApp, Signal
- [ ] **43 · Cycle de vie robuste** — vidange, forensique d'arrêt, watchdog,
      anti-boucle de redémarrage, scale-to-zero, moniteur mémoire, skew de code
      _(la borne d'arrêt de Cmd+Q est faite : `2ea9b9951`)_
- [ ] **44 · `/handoff`, `/sethome`, `/platforms`**
- [ ] **45 · `/clarify` depuis la passerelle** — l'agent pose une question et
      **bloque**, y compris depuis le téléphone. `tools/clarify_gateway.py`

## Niveau 3 — bon

- [x] **46 · `doctor`** — auto-diagnostic complet. Un constat sans geste est
      un voyant qu'on apprend à ignorer. `hermes_cli/doctor.py` (2 770)
      **Branché le 01/08** : le module était complet, testé — et sans aucun
      appelant, donc muet. Outil MCP `sante`. Le jour du branchement il avait
      déjà quelque chose de vrai à dire : `thread_messages_fts` (migration 036)
      manquait aux DEUX bases de la machine.
      → `973b47aac`
- [~] **47 · Cron intégré** — le **garde anti-zombie livré le 01/08**, avant
  l'ordonnanceur et pas après : c'est lui qui rend le reste sûr.
  Leur piège : un job qui redémarre son propre exécuteur ne s'arrête
  jamais. Le superviseur relance, la reprise ramasse la session fautive,
  le tour rejoue la même logique — toutes les dix secondes, jusqu'à ce
  qu'un humain casse la boucle. La forme existe chez nous, et c'est notre
  propre code qui l'écrit : « tuer le backend de bureau est futile, l'app
  le supervise et le respawne » (`DesktopUpdates.ts`).
  Repris tel quel, leur choix décisif : le motif s'ancre sur une FORME DE
  COMMANDE, jamais sur de la prose — une consigne part vers un modèle, pas
  vers un shell. C'est la leçon que le garde de ce dépôt avait payée le
  31/07 en lisant une LIGNE comme une COMMANDE.
  Ajouté à leur liste : la MISE À JOUR par RPC. Elle ne ressemble pas à un
  redémarrage, et c'est exactement le même piège.
  Branché dans `remplir` (chaîne n°48 → n°49 → ici), APRÈS substitution :
  sur le gabarit on ne verrait que des accolades.
  _(reste : l'ordonnanceur lui-même et le registre des exécutions —
  `scheduler.py` 4 364, `jobs.py` 2 609. Ils font tourner des tours
  d'agent sans surveillance, donc ils dépensent du quota tout seuls :
  palier D2, à montrer avant de lancer.)_
- [x] **48 · Blueprints d'automatisation à slots typés** — on ne tape jamais
      de cron brut. `cron/blueprint_catalog.py` (713) → `6e63a4ef9`
- [x] **49 · Suggestions d'automatisation** — l'agent propose, l'humain
      dispose, et le refus TIENT. `cron/suggestions.py` → `6fe5512f1`
- [~] **50 · Hub de skills** — **la moitié LECTURE livrée le 01/08**, et
  c'est elle qui débloquait le n°10 : `inspecter-skill` lit un dossier
  candidat et le passe au scanner. Lecture en LARGEUR d'abord — si le
  plafond tombe, on veut avoir vu `SKILL.md` plutôt qu'un `node_modules`
  rencontré en premier — et UN fichier de plus que la limite du scanner,
  pour qu'il puisse constater le dépassement au lieu de voir un dossier
  pile conforme.
  _(reste : l'INSTALLATION — recherche, copie, synchro par hash d'origine.
  Elle écrit dans le home Claude de l'humain, c'est-à-dire l'endroit que
  notre désinstalleur classe « ne se touche JAMAIS » (n°58). Ça se décide,
  ça ne se glisse pas dans un outil de lecture : palier D2.)_
  `tools/skills_hub.py` (4 151)
- [ ] **51 · Les 182 skills** — `software-development`, `github`, `research`,
      `autonomous-ai-agents`, `mlops`, `security` en priorité **(copie markdown)**
- [ ] **52 · Bundles de skills** — un alias `/<nom>` déclenche plusieurs
      skills. `hermes_cli/bundles.py`
- [ ] **53 · Compatibilité agentskills.io + index Anthropic/OpenAI/LobeHub**
- [ ] **54 · Conduite fine de session** — `/steer` (injecter après le prochain
      outil, sans interrompre), `/queue`, `/busy` avec politique par commande
- [–] **55 · ~~Compression dirigée~~** — **Bloqué en amont, vérifié le
  01/08.** Le compactage n'est pas à nous : c'est Claude Code qui le déclenche
  et le conduit. J'ai énuméré TOUS les sous-types de commande du SDK
  (`sdk.d.ts`) — `interrupt`, `set_model`, `mcp_toggle`, `reload_skills`,
  `stop_task`, une quarantaine d'autres — et **aucun ne demande un
  compactage**. Le SDK expose le compactage en ÉVÉNEMENT (`compact_boundary`,
  `compact_summary`, statut `compacting`), jamais en action.
  Écrire `/compress here` chez nous produirait donc une commande qui n'a
  personne à qui parler. À rouvrir le jour où le SDK ouvre ce contrôle — pas
  avant. (C'est le même mur que le seuil automatique, écarté plus tôt : on ne
  contrôle pas la cible.)
- [x] **56 · Export de session** — une conversation pouvait vivre dans la base
      ou nulle part. `session_export_md.py` → `51d8e1c07`
      _(reste : l'export HTML, les filtres, le listing)_
- [x] **57 · Mise à jour propre** — l'essentiel de leur liste était DÉJÀ chez
      nous, et mieux : le verrou existe (`inFlight`), et notre rollback est
      structurel — une version s'installe À CÔTÉ, se vérifie en préflight
      pendant que le serveur courant tourne, et ne devient courante qu'après ;
      un échec laisse le serveur en vie. Leur autostash / détection de fork /
      repli ZIP sont des artefacts d'un produit qui EST une copie git : sans
      objet ici.
      Il manquait une chose, la bonne : **refuser plutôt que courser**. Le
      redémarrage tuait tout tour en vol sans regarder — et un tour coupé
      passe à `interrupted`, état terminal, il ne reprend pas. Consultation
      DEUX fois (avant de télécharger, puis juste avant de basculer, parce que
      le préflight dure des minutes), refus par défaut quand personne n'est
      devant la machine, forçage explicite comme porte. Fil-piège fantôme à
      240 min = 2,8× le plus long tour jamais mesuré (85,2 min sur 583), pour
      qu'un tour bloqué ne condamne pas le serveur à ne plus jamais se mettre
      à jour. `update_cmd.py` (5 086)
      _(reste : le même garde côté app de bureau — `DesktopUpdates.install`
      coupe encore sans demander ; il lui manque le fait, qui vit dans le
      serveur, pas dans le processus Electron)_
- [x] **58 · Désinstallation propre** — leurs trois granularités (l'app seule,
      l'app + l'agent en gardant les données, tout), mais la décision ne se
      prend PAS sur la granularité : elle se prend sur l'APPARTENANCE du
      chemin. Le home Claude et les dépôts de l'utilisateur valent « jamais »
      sur les trois colonnes — ils existaient avant T3. Module pur : il décide,
      un autre effacera, et cet autre ne saura rien décider (un désinstalleur
      est le seul code dont un bug n'a pas d'annulation). `uninstall.py` (964)
      _(reste : l'exécution — retrait du PATH, wrappers, service ; à écrire le
      jour où T3 s'installe hors du `.app`)_
- [x] **59 · Inventaire** — le `doctor` DIAGNOSTIQUE, l'inventaire DÉCRIT :
      versions, comptes, serveurs MCP, poids de l'état. Avec la contrainte
      qu'ils n'ont pas nommée — un inventaire est fait pour être COLLÉ quelque
      part d'où on ne peut plus le retirer, donc aucune valeur n'y entre : les
      variables par NOM, les chemins sans le nom de session.
      `inventory.py`, `dump.py`, `status.py`
      **Branché le 01/08** : outil MCP `inventaire`. Un défaut corrigé au
      passage — `serveursMcp` était une liste, donc « vide » se lisait « il
      n'y en a pas ». Or T3 ne configure PAS les serveurs MCP, ils vivent dans
      chaque home Claude : le champ accepte maintenant `null`, qui dit « pas
      regardé ». Une liste vide dit « on a cherché », `null` dit « on n'a pas
      cherché », et les confondre transforme un fait sur NOUS en affirmation
      sur le monde (H4).
      _(reste : l'upload de diagnostic vers un serveur — on ne l'enverra
      nulle part.)_
- [–] **60 · ~~Observabilité~~** — **Déjà couvert, vérifié le 01/08.** Les
  quatre points de la ligne existent ou sont sans objet :
  · **OTLP** — `otlpTracesUrl`, `otlpMetricsUrl`, `otlpExportIntervalMs`,
  `otlpServiceName` sont dans `config.ts`, et le dossier
  `observability/` porte `Metrics.ts`, `Attributes.ts`,
  `RpcInstrumentation.ts`, `BrowserTraceCollector.ts` ;
  · **contrat de métriques partagées** — c'est `Attributes.ts` :
  `MetricAttributes`, `ObservabilityOutcome`, `compactMetricAttributes`.
  Les compteurs sont nommés et centralisés (`t3_rpc_requests_total`,
  `t3_provider_turn_duration`, …) ;
  · **santé passerelle** et **santé cron** — la passerelle (n°37→45) et le
  cron intégré (n°47) n'existent pas ici. Une sonde de santé sur un
  service absent n'est pas un manque, c'est une ligne sans objet.
- [x] **61 · Classification d'erreurs** — fondue dans `classerEchec`, pas
      posée à côté : deux natures de plus, choisies parce que leur REMÈDE
      diffère (`contexte-trop-grand` → compresser ; `surcharge-fournisseur`
      → attendre). Les deux étaient basculées à tort, donc brûlaient le tour
      d'un second compte Max pour rien. `agent/error_classifier.py` (1 717)
      _(reste : les natures propres aux 33 fournisseurs d'API — sans objet
      chez nous.)_
- [–] **62 · Isolation d'egress + proxy** — un proxy existe déjà ; leur module vise un déploiement exposé, pas une app de bureau.

- [x] **63 · Navigateur** — le toolkit `preview` pilote un onglet réel — 15 poignées, toutes derrière la porte de sortie.

- [ ] **64 · Computer use** — contrôle du bureau, routage vision, permissions
- [ ] **65 · Mot d'éveil 100 % local** — 3 moteurs ONNX embarqués, aucun audio
      ne sort. `tools/wake_word.py` (1 267)
- [ ] **66 · TTS en streaming** — l'agent parle pendant qu'il génère
- [ ] **67 · Kanban** — décomposition automatique, spécification, essaim,
      watchers. `kanban_db.py` (10 010)
- [x] **68 · Projets** — sélecteur de projet (⌘P) et recherche de contenu (⇧⌘F), livrés en amont.

- [ ] **69 · Génération d'images et de vidéos** — 7 fournisseurs image, FLUX3
- [x] **70 · Vision** — 11 commits sur les images du composeur ; le modèle voit déjà.

- [~] **71 · Hooks de plugin** — **le hook de TRANSFORMATION livré le 01/08**,
  et il ferme un trou béant.
  `mcp/SortieDOutil.ts` s'appelle « PORTE OBLIGATOIRE », et un test
  structurel vérifie que nos six toolkits la traversent. Sauf qu'elle ne
  gardait que NOS 23 outils MCP : `Bash`, `Read`, `Grep`, `WebFetch`
  rendaient leur sortie au modèle sans jamais la croiser — alors que ce
  sont EUX qui rapportent le plus de contenu tiers.
  Branché par `hooks.PostToolUse` → `updatedToolOutput` (« works for all
  tools »). J'avais d'abord écarté le branchement en croyant que le
  plafond de 40 000 tronquerait un `Read` : relecture faite, la porte ne
  coupe RIEN — « couper au milieu d'un JSON rendrait une structure
  invalide ». Elle caviarde en gardant la forme, et se contente de
  signaler un dépassement.
  Trois décisions du branchement :
  · il rend `null` quand il n'y a rien à faire, et le SDK garde alors la
  sortie originale à l'octet près — un rappel qui renvoie toujours un
  objet recopierait chaque sortie du produit pour rien ;
  · l'avertissement de contenu tiers part par `additionalContext`, À CÔTÉ
  du résultat. Le glisser dedans ferait rendre à un `Read` un fichier
  qui ne ressemble plus à ce qu'il y a sur le disque ;
  · la note de dépassement de plafond, elle, est FILTRÉE : 40 000 est
  notre budget de sortie MCP, une règle qu'on s'est donnée pour des
  outils qu'on écrit. La servir sur un `Read` apprendrait au modèle à
  ignorer nos avertissements.
  _(reste : les 6 autres événements d'agent, et
  `transform_terminal_output`. Trouvé au passage et NON traité :
  `Caviarder` connaît `AKIA…` — l'identifiant AWS — mais pas
  `AWS_SECRET_ACCESS_KEY=…`, c'est-à-dire la moitié qui compte.)_
  **Palier D2** : le rappel est prouvé par 8 tests sur la fonction pure,
  mais il transforme la sortie de TOUS les outils. À montrer sur un vrai
  tour avant de déployer.
- [–] **72 · ~~Toolsets composables~~** — **Écarté sur mesure, 01/08.** Deux
  raisons, dans cet ordre.
  D'abord la primitive existe DÉJÀ, et pas chez nous : le SDK porte un
  sous-type `mcp_toggle` (« enables or disables an MCP server »). L'activation
  à chaud ne demande pas un système de composition, elle demande de relayer un
  message qui existe.
  Ensuite le gain ne le justifie pas. Mesuré sur nos huit toolkits : **23
  outils, ~7 300 caractères de description** au total, dont `preview` en pèse
  39 % à lui seul. Face aux résultats d'outils, mesurés à **54 % de la
  fenêtre** et déjà bornés à 40 000 caractères par la porte de sortie, les
  DÉFINITIONS ne sont pas le problème. Construire une composition d'outils
  pour récupérer quelques milliers de caractères, ce serait soigner ce qui ne
  saigne pas.
  _(À rouvrir si un serveur MCP tiers fait exploser le compte d'outils : le
  relais de `mcp_toggle` sera alors une petite tranche, pas un chantier.)_
- [–] **73 · Conscience de batterie** — leur correctif répond à un démon qui sonde en boucle. À rouvrir si une MESURE montre que T3 vide la batterie.

- [x] **74 · Générateur de titre + indices de sous-répertoire** — régénération de titre depuis la barre latérale, livrée en amont.

- [–] **75 · ~~Timeouts de raisonnement~~** — **Écarté, mesuré.** Leurs
  modules visent un timeout de TRANSPORT : un proxy cloud qui tue un flux
  de pensée avant le premier jeton. T3 passe par le CLI, qui possède le
  transport. Et la panne équivalente chez nous n'existe pas : sur 579
  tours, 13 dépassent 30 minutes et **aucun** n'a moins de 10 activités —
  les tours longs travaillent, ils ne sont pas bloqués.

## Niveau 4 — moins fort, mais toujours bon

- [x] **76 · Moteur de skins multi-surfaces** — l'éditeur de thème d'Arc, mesuré sur 10 761 frames, thème par projet.

- [x] **77 · i18n — 17 langues** — des locales existent déjà côté paquets.

- [–] **78 · Vue focus, moteur console, UI curses de repli, presse-papier** — T3 est Electron : une UI terminal de repli répond à un produit qui vit dans un terminal.

- [ ] **79 · Bannière, onboarding, tips**
- [ ] **80 · Achievements + Petdex** — gamification de la progression
- [–] **81 · ~~Tableaux markdown propres~~** — **Déjà couvert, et au-delà.**
  Leur chantier vise un rendu de tableau dans un TERMINAL, qui est leur
  surface. La nôtre est un moteur de rendu réel : `ChatMarkdown.tsx` monte
  `remark-gfm` (donc les tableaux GFM), et `index.css` porte un
  `chat-markdown-table-container` REPLIABLE (`data-expanded`). On n'a pas le
  problème qu'ils résolvent, et on a une réponse qu'ils n'ont pas.
- [–] **82 · ~~Migration depuis un autre agent~~** — **Écarté sur lecture,
  01/08.** Le fichier n'est pas une migration générique : c'est
  `hermes claw`, l'import d'**OpenClaw** — un produit précis, leur
  concurrent direct. On n'a aucun utilisateur à en faire venir.
  Et la question générale ne se pose pas de la même façon chez nous : les
  agents dont on aurait pu vouloir « migrer » (Claude Code, Codex, Cursor,
  OpenCode) sont des FOURNISSEURS que T3 pilote déjà. On ne migre pas depuis
  eux, on s'y branche. `hermes_cli/claw.py`
- [~] **83 · Trajectoires + batch runner** — les **trajectoires sont déjà
  là**, et complètes : `projection_thread_activities` porte **61 963
  activités** sur cette machine (chaque appel d'outil, son entrée, son
  verdict). C'est ce que les n°2, n°9 et n°22 lisent déjà pour répondre
  « qu'est-ce qui a vraiment tourné ? ». Rien à enregistrer de plus.
  _(reste : le lanceur en LOT — rejouer N consignes et collecter les
  sorties. Il dépense du quota sans surveillance, donc palier D2 ; et il
  n'a de sens qu'avec des évals, qui vivent dans le n°I4 de la LOI plutôt
  que dans ce catalogue.)_
- [x] **84 · Recherche web multi-fournisseurs** — firecrawl, exa, brightdata branchés en MCP — un fournisseur de plus est une ligne de config, pas un plugin.

- [–] **85 · ~~Backends de mémoire enfichables~~** — **Écarté, 01/08.** Les
  trois nommés (honcho, mem0, supermemory) sont des services SaaS de mémoire.
  On a UN backend — SQLite + FTS5, livré au n°5 — et personne n'en demande un
  second. Une couche d'enfichage pour un seul enfichable est l'abstraction
  écrite avant la troisième occurrence réelle, c'est-à-dire exactement ce que
  la RÈGLE SUPRÊME refuse.
  S'y ajoute une raison de fond : envoyer les conversations à un service tiers
  est une décision de produit et de vie privée, pas un choix technique. Elle
  remonterait à Enzo avant d'être un chantier.

---

## Copies directes — pas du port, du transfert

| Quoi                                                                                                              | Volume                        |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Les **182 `SKILL.md`**                                                                                            | markdown, MIT                 |
| Le tokenizer **`fts5_cjk`**                                                                                       | C, compile pour `node:sqlite` |
| `DANGEROUS_PATTERNS`, `threat_patterns`, regex de `skills_guard`                                                  | données                       |
| Les **prompts** : `learn_prompt`, revue du curateur, gabarit de compression                                       | texte                         |
| **17 fichiers de locale**                                                                                         | texte                         |
| Contrats écrits : `ADDING_A_PLATFORM.md`, `relay-connector-contract.md` (770 l.), `session-lifecycle.md` (637 l.) | doc                           |

## Ce qu'on ne prend pas

**Le moteur** — `conversation_loop`, `anthropic_adapter`, `bedrock`, `vertex`,
`azure`, `gemini`, transports, `moa_loop`, `prompt_builder`,
`prompt_caching`, `context_compressor`. On reste sur le SDK et les comptes Max.

**Leur économie** — `credits_tracker`, `usage_pricing`, `billing_*`,
`nous_account`, `subscription_view`. On a `comptePool`, fait pour trois
abonnements, pas pour du token facturé.

**Les 33 fournisseurs d'API** — sans objet.

**Le périmètre grand public** — Pokémon, Minecraft, Spotify, Philips Hue,
crypto, BCI, téléphonie, Apple Notes, Home Assistant. Si l'un devient utile,
il remonte.
