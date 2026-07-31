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

Légende : `[x]` livré (avec son commit) · `[ ]` à faire · `[–]` écarté, avec
la raison — un écart sans raison se rouvre tous les mois.

---

## Niveau 1 — extrêmement fort

- [x] **1 · Le curateur** — la DÉCISION, avec les quatre invariants stricts
      portés tels quels + un cinquième qui est le nôtre : un usage
      `indécidable` (n°2) interdit tout geste. Archive, n'efface jamais.
      `agent/curator.py` (2 019)
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
- [x] **4 · Les NORMES d'une skill** — leur `_AUTHORING_STANDARDS` porté non
      pas en prompt mais en CONTRÔLE : un prompt est un espoir, un contrôle est
      un fait, et il s'applique aussi aux skills déjà écrites. Seuil de
      description à 240 (le leur, 60, vient de LEUR troncature ; le nôtre vient
      de notre mesure). `agent/learn_prompt.py` (150)
      _(reste : la fabrication elle-même — depuis un dossier, une URL, la
      conversation. Elle a besoin d'un tour de modèle, pas d'un module pur.)_
- [x] **5 · Recherche FTS dans toutes les conversations** — 3 modes déduits
      des arguments, coût LLM zéro, fenêtre ±5, bornes de fil, un résultat par
      fil. `tools/session_search_tool.py` (1 142)
      → `5dcdc8647`, plafonds mesurés dans `71c1d7b38`
- [ ] **6 · Tokenizer CJK compilé** — bigrammes, sinon les termes de 1-2
      caractères tombent en scan complet. `native/fts5_cjk/` **(copie C)**
- [ ] **7 · PTC — appel d'outils programmatique** — le modèle écrit un script
      qui appelle nos outils, N tours → 1. Seul le `stdout` revient. Chez nous il
      passe par notre serveur MCP, pas par un socket Unix.
      `tools/code_execution_tool.py` (2 014)
- [ ] **8 · `/goal` — la boucle Ralph** — juge après chaque tour, continuation
      = message normal (cache intact), juge fail-OPEN, message utilisateur
      préempte, survit au `/resume`. `hermes_cli/goals.py` (1 807)
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
      _(reste : le branchement sur un vrai chemin d'import — il n'y en a pas
      encore, c'est le n°50.)_
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
- [ ] **15 · Vérification CVE/OSV comme OUTIL** (pas seulement en CI)
      `tools/osv_check.py`
- [ ] **16 · Sources de secrets externes** — 1Password, Bitwarden, commande.
      `agent/secret_sources/`
- [x] **17 · Rédaction des secrets** — 985 lignes rien que pour caviarder
      journaux et télémétrie. `agent/redact.py`, `monitoring/redaction.py`
      → `8be2f82c1`, branché à la sortie d'outil dans `422454103`
- [–] **18 · ~~Permissions des credentials~~** — **Écarté, le catalogue se
  trompait** : `credential_files.py` (525 l.) n'est pas un contrôle de
  permissions, c'est un registre de MONTAGE de fichiers dans des
  conteneurs de terminal distants. Sans objet — T3 n'en a pas. Vérifié en
  lisant le fichier.
- [ ] **19 · Hooks shell à consentement première utilisation** — allowlist
      `(événement, commande)`, `shell=False` + `shlex.split`.
      `agent/shell_hooks.py`
- [ ] **20 · Audit de sécurité au démarrage + avis poussés**
      `security_audit_startup.py`, `mcp_security.py`, `input_sanitize.py`
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
- [ ] **26 · Délégation** — sous-agents isolés, cycle de vie, log en direct,
      revue en arrière-plan. `tools/delegate_tool.py` (3 974)
- [x] **27 · Lecture du contexte** — « il te reste 3 tours » au lieu de
      « 83 % ». `agent/iteration_budget.py` → `b0a4cf0d0`
      _(reste : répartition par catégorie, références)_
- [ ] **28 · Client LSP** — l'agent voit le code comme un IDE. Chez nous :
      exposé en outil MCP. `agent/lsp/`
- [ ] **29 · Environnements d'exécution** — Docker, Modal, Daytona, Vercel
      Sandbox + synchro de fichiers. `tools/environments/`
- [ ] **30 · Registre de processus + pool de démons + interruption**
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
- [ ] **35 · Récupération de session corrompue**
      `hermes_cli/session_recovery.py` (1 407), `_early_recovery.py`
- [–] **36 · Robustesse SQLite** — **Écarté** : leur mode de panne
  (verrous POSIX annulés par un `close()` sur n'importe quel fd) nous est
  inaccessible — les scopes de Layer ferment la base, et rien ne sonde le
  fichier directement.

## Niveau 2 — le gateway (en interne, pas en appelant Hermès)

- [ ] **37 · Architecture de passerelle** — continuité de session ENTRE
      plateformes, bail de tour (un seul écrivain), slash universelles.
      `gateway/session.py` (3 307), `turn_lease.py`, `slash_commands.py` (5 483)
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
      → `973b47aac`
- [ ] **47 · Cron intégré** — scheduler, jobs, exécutions, garde anti-zombie.
      `cron/scheduler.py` (4 364), `jobs.py` (2 609), `lifecycle_guard.py`
- [x] **48 · Blueprints d'automatisation à slots typés** — on ne tape jamais
      de cron brut. `cron/blueprint_catalog.py` (713) → `6e63a4ef9`
- [x] **49 · Suggestions d'automatisation** — l'agent propose, l'humain
      dispose, et le refus TIENT. `cron/suggestions.py` → `6fe5512f1`
- [ ] **50 · Hub de skills** — recherche, installation, synchro avec hash
      d'origine. `tools/skills_hub.py` (4 151)
- [ ] **51 · Les 182 skills** — `software-development`, `github`, `research`,
      `autonomous-ai-agents`, `mlops`, `security` en priorité **(copie markdown)**
- [ ] **52 · Bundles de skills** — un alias `/<nom>` déclenche plusieurs
      skills. `hermes_cli/bundles.py`
- [ ] **53 · Compatibilité agentskills.io + index Anthropic/OpenAI/LobeHub**
- [ ] **54 · Conduite fine de session** — `/steer` (injecter après le prochain
      outil, sans interrompre), `/queue`, `/busy` avec politique par commande
- [ ] **55 · Compression dirigée** — `/compress here`, `focus <sujet>`,
      `--preview`, retour utilisateur
- [x] **56 · Export de session** — une conversation pouvait vivre dans la base
      ou nulle part. `session_export_md.py` → `51d8e1c07`
      _(reste : l'export HTML, les filtres, le listing)_
- [ ] **57 · Mise à jour propre** — verrou, rollback de commit épinglé,
      récupération d'autostash, relance, migration. `update_cmd.py` (5 086)
- [ ] **58 · Désinstallation propre** `uninstall.py` (964)
- [ ] **59 · Inventaire, dump, logs, statut, debug, upload de diagnostic**
- [ ] **60 · Observabilité** — OTLP, santé passerelle, santé cron, contrat de
      métriques partagées
- [ ] **61 · Classification d'erreurs** — à fondre avec notre carnet des
      pannes non reconnues. `agent/error_classifier.py` (1 790)
- [ ] **62 · Isolation d'egress + proxy**
- [ ] **63 · Navigateur** — superviseur avec redémarrage, CDP direct sur ton
      Chromium, dialogues, furtif. `tools/browser_supervisor.py` (1 518)
- [ ] **64 · Computer use** — contrôle du bureau, routage vision, permissions
- [ ] **65 · Mot d'éveil 100 % local** — 3 moteurs ONNX embarqués, aucun audio
      ne sort. `tools/wake_word.py` (1 267)
- [ ] **66 · TTS en streaming** — l'agent parle pendant qu'il génère
- [ ] **67 · Kanban** — décomposition automatique, spécification, essaim,
      watchers. `kanban_db.py` (10 010)
- [ ] **68 · Projets** `projects_db.py`, `projects_cmd.py`
- [ ] **69 · Génération d'images et de vidéos** — 7 fournisseurs image, FLUX3
- [ ] **70 · Vision** `tools/vision_tools.py` (1 925)
- [ ] **71 · Hooks de plugin** — 7 événements agent + **3 hooks de
      transformation** (`transform_tool_result`, `transform_terminal_output`)
- [ ] **72 · Toolsets composables** — héritage, activation à chaud
- [ ] **73 · Conscience de batterie** `agent/battery.py`
- [ ] **74 · Générateur de titre + indices de sous-répertoire**
- [ ] **75 · Timeouts de raisonnement + guidance** quand le modèle pense trop
      longtemps

## Niveau 4 — moins fort, mais toujours bon

- [ ] **76 · Moteur de skins multi-surfaces** `hermes_cli/skin_engine.py`
- [ ] **77 · i18n — 17 langues** + i18n dans l'agent lui-même **(copie
      partielle)**
- [ ] **78 · Vue focus, moteur console, UI curses de repli, presse-papier**
- [ ] **79 · Bannière, onboarding, tips**
- [ ] **80 · Achievements + Petdex** — gamification de la progression
- [ ] **81 · Tableaux markdown propres**
- [ ] **82 · Migration depuis un autre agent** `hermes_cli/claw.py`
- [ ] **83 · Trajectoires + batch runner**
- [ ] **84 · Recherche web multi-fournisseurs** — brave, ddgs, exa, firecrawl
- [ ] **85 · Backends de mémoire enfichables** — honcho, mem0, supermemory

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
