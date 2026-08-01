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

**36 livrés · 18 partiels · 35 écartés sur pièce · 1 RESTANT — 90 lignes.**

> Le total se VÉRIFIE contre les cases, il ne se retient pas :
> `awk '/^- \[x\]/{x++} /^- \[~\]/{t++} /^- \[–\]/{e++} /^- \[ \]/{v++} END{print x,t,e,v,x+t+e+v}' docs/CHANTIER-HERMES.md`
> Deux fois le 01/08 il a divergé après une modification — c'est ce contrôle
> qui l'a vu, pas ma relecture.

> Corrigé le 01/08 : l'entrée **77 · i18n** était cochée à tort — des locales
> présentes dans des paquets avaient été prises pour un réglage livré. Le
> compte disait donc « 0 restant » alors qu'une demande d'Enzo dormait. Un
> total ne vaut que ce que valent ses cases.

Chaque ligne a été INSTRUITE : aucune n'est restée sans qu'on aille voir. Un
écart porte toujours sa raison, et une raison porte un reçu quand elle repose
sur une mesure.

### La fouille du binaire — faite le 01/08, ne pas la refaire

Cinq verdicts sont tombés en lisant le binaire du CLI que T3 lance
(`~/.local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`, 257 Mo,
477 114 chaînes) au lieu de raisonner sur ce qu'il devrait contenir :

| ce que je croyais                   | ce que le binaire dit                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **n°8** à construire                | `name:"goal"`, `supportsNonInteractive`, `/goal clear`                                                    |
| **n°54** à construire               | `queuedCommands`, « Message queued for the main conversation's next turn. »                               |
| **n°7** chantier à part (2 014 l.)  | « execute JavaScript with programmatic tool access », « Names of tools registered during this execution » |
| **n°28** chantier à part (4 400 l.) | `goToDefinition`, `findReferences`, `workspaceSymbol`, `documentSymbol`, `hover`, `diagnostics`, `rename` |
| **n°12** « 0 ligne »                | 13 `tool.denied` — le blocage est double, et l'autre est le volume                                        |

**Et ce que la même fouille N'A PAS trouvé**, donc qui reste vraiment à nous :
aucune passerelle (`Telegram` n'apparaît que comme exemple dans un libellé de
config MCP, `Discord` comme lien de bun), aucun mot d'éveil, aucune synthèse
vocale, aucune génération d'images. Les `onboarding` sont ceux du CLI, pas
ceux de T3.

La leçon, écrite ici pour qu'elle serve : **« ce que le CLI contient » est un
ÉTAT, pas une déduction** — A1 s'y applique. Deux des cinq lignes tombées
étaient classées « chantier à part entière » au niveau le plus fort.

Les 85 lignes sont instruites. Il ne reste aucune ligne ouverte.

### Les deux dernières, et l'erreur qu'elles ont corrigée

J'ai tenu n°3 et n°12 pour « bloqués par le TEMPS » pendant toute la
campagne. C'était une confusion entre deux choses différentes : l'intérêt de
la SORTIE et la constructibilité du MODULE. Un module qui répond « pas assez
de preuves, il en manque 5 » est la bonne implémentation, pas une
implémentation absente — H4 le dit depuis le début.

**Ce que la vraie donnée a renversé, en allant la lire :**

| ce que je croyais                                             | ce que la base dit                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| la commande d'un refus est irrécupérable sans une clé à poser | `tool.completed` porte `data.result.tool_use_id` À CÔTÉ de `data.input` — **13 refus sur 13 rattachés** |
| la clé que j'ai posée le 01/08 a rendu l'attente productive   | elle n'a jamais tourné : l'app installée date du 31/07 15h54, le commit de 02h27 le lendemain           |
| l'issue d'un appel de skill n'est pas enregistrée             | `data.result.is_error` : 6 081 succès, 203 échecs                                                       |

La clé ajoutée n'était donc **pas nécessaire**. Elle ne gêne pas, mais elle
n'a rien débloqué — cinquième fois de la campagne qu'aller LIRE renverse un
verdict tiré du raisonnement. A1 s'applique aux états, et « ce que la base
contient » est un état.

**Ce que les modules rendent sur les vraies données**, mesuré le 01/08 :

| n°12 | 13 refus lus, 12 rattachés à leur commande, **0 suggestion** — 10 sont des chaînes shell dont le début ment sur la suite, 1 vise un autre outil que Bash, et `pwd` (2 fois) est tombé le même jour |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| n°3  | 64 mutations lues dans git, 11 observations d'usage, **0 jugeable** — 59 skills jamais observées, 4 trop récentes, 1 sans assez de preuves                                                         |

Deux listes vides, et c'est le produit : dans les deux cas la VALEUR est dans
les raisons chiffrées, pas dans la liste. Un suggéreur naïf aurait proposé
`Bash` sur 12 refus ; le nôtre dit pourquoi il ne propose rien.

**Le garde propre à n°12**, qui n'existe pas chez Hermès : leur
`approvals_suggest.py` compte et propose les plus fréquents. C'est le seul
module de la maison qui propose d'OUVRIR une frontière de sécurité, donc la
charge de la preuve s'inverse — motif établi sur DEUX JOURS distincts (12 des
13 vrais refus sont tombés le même après-midi), jamais un outil nu, jamais une
chaîne shell, et **jamais une commande destructrice quel que soit son
compteur : la fréquence n'est pas un consentement.**

Restent **deux activations**, qui ne sont pas des lignes du catalogue mais qui
tiennent leur mise en service : un **jeton de bot Telegram** et un
**fournisseur d'images avec son plafond**. Les deux sont dans
`DECISIONS-EN-ATTENTE.md`.

### Le fil qui traverse la nuit du 01/08

**Le garde avant le moteur.** L'anti-zombie avant l'ordonnanceur du cron,
l'autorisation avant l'adaptateur de passerelle, le budget avant le
fournisseur d'images. Chaque fois, la règle est écrite et testée pendant qu'il
est encore facile de la faire respecter — et chaque fois, elle a servi
immédiatement à écrire la suite.

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
- [x] **3 · Graphe d'apprentissage** — `agent/learning_graph.py`,
      `learning_mutations.py`, `hermes_cli/journey.py`
      **LIVRÉ le 01/08.** Ce qu'on ne refait pas : la traçabilité des
      mutations, que git donne déjà (64 mutations lues sur 24 skills). Ce
      qu'on ajoute, et que git ne peut pas faire : la CORRÉLATION — est-ce que
      ce changement a amélioré quelque chose ?
      **Trois pièges désamorcés**, et aucun n'est décoratif :
      · **le voisin** — la fenêtre d'après s'arrête à la mutation SUIVANTE.
      Sans ça, l'effet d'une mutation est attribué à celle d'avant ;
      · **le petit nombre** — _si retirer UNE observation favorable efface
      l'écart, il n'y a pas d'écart._ Aucune constante, s'adapte tout seul à
      la taille ;
      · **la fenêtre encore ouverte** — « trop récent » et « pas assez de
      preuves » sont deux verdicts distincts : l'un demande d'attendre,
      l'autre dit que le verdict ne viendra pas tout seul.
      Le plancher de 5 observations ne fait PAS double emploi avec la règle de
      robustesse : 0/2 puis 5/5 survit à une observation retournée (+50 pts) et
      ne décrit pourtant rien. Le test le prouve.
      Reçu sur données réelles : 64 mutations, 11 observations, **0 jugeable**
      — 59 jamais observées, 4 trop récentes, 1 sans assez de preuves. C'est la
      bonne réponse, et c'est le produit : inventer une corrélation là-dessus
      donnerait à un écart d'une observation l'autorité d'une mesure.
      Branché : outil MCP `apprentissage` (+ `ApprentissageStore`, qui lit git
      ET la projection). Le rendu visuel et la frise `/journey` restent de
      l'interface : Enzo.
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
- [–] **6 · Tokenizer CJK** — **ÉCARTÉ sur mesure, 01/08, et le chantier a changé de
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

- [–] **7 · ~~PTC — appel d'outils programmatique~~** — **Écarté : le CLI le
  porte déjà.** Troisième ligne fermée le 01/08 en fouillant le binaire du CLI
  que T3 lance, après le n°8 et le n°54. Les chaînes de schéma sont sans
  ambiguïté :

      execute JavaScript with programmatic tool access
      JavaScript code to execute. Supports top-level await.
        State persists across calls.
      The code that was executed
      Return value from the code execution
      Captured console.log output
      Names of tools registered during this execution

  C'est exactement leur `code_execution_tool.py` : un bac à sable JavaScript
  où les outils sont ENREGISTRÉS et appelables, avec état persistant entre les
  appels, et seule la sortie qui revient. Le gain de contexte que la ligne
  promettait — N tours → 1 — est donc déjà disponible.
  T3 ne restreint aucun outil sur la session principale (`allowedTools` n'y
  est jamais posé), donc rien de notre côté ne le cache.
  Écrire le nôtre par-dessus notre serveur MCP doublerait un moteur qu'on ne
  possède pas — le verdict des n°25, n°26 et n°30, appliqué au plus gros
  morceau du niveau 1. `tools/code_execution_tool.py` (2 014)

- [–] **8 · ~~`/goal` — la boucle Ralph~~** — **Écarté : on l'a déjà, et
  c'est celui qu'on utilise.** La question était ouverte parce que je ne
  trouvais pas le bundle du CLI. Trouvé le 01/08 dans
  `~/.local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe` :

      name:"goal", description:"Set a goal Claude checks before stopping"
      name:"goal", supportsNonInteractive:!0, thinClientDispatch:"post-text"
      "/goal clear to stop early"

  `supportsNonInteractive: true` avec `thinClientDispatch: "post-text"`
  signifie qu'il passe par le chemin stream-json du SDK — **donc les
  utilisateurs de T3 en disposent déjà**, sans une ligne de notre part.
  Écrire le nôtre doublerait un mécanisme qui tourne, et qui a piloté cette
  session entière. `hermes_cli/goals.py` (1 807)
  _(Bon à savoir : `/goal clear` l'arrête.)_

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
- [x] **12 · Suggestions d'allowlist** — `hermes_cli/approvals_suggest.py`
      **LIVRÉ le 01/08**, et ma lecture du 01/08 au matin était fausse sur le
      point qui bloquait tout.
      J'avais écrit : « la commande refusée n'est enregistrée nulle part », et
      j'en avais déduit qu'il fallait poser une clé. Faux. `tool.completed`
      porte `data.result.tool_use_id` — le même identifiant que le refus — À
      CÔTÉ de `data.input` qui contient la commande. La jointure retrouve
      **13 refus sur 13**. La clé que j'avais ajoutée n'était pas nécessaire,
      et elle n'a de toute façon jamais tourné : l'application installée date
      du 31/07 15h54, le commit du 01/08 02h27.
      **L'inversion de la charge de la preuve**, qui est notre écart avec eux :
      c'est le seul module de la maison qui propose d'OUVRIR une frontière de
      sécurité. Une suggestion acceptée élargit, définitivement et
      silencieusement ; un refus de suggérer coûte un aller-retour. Donc :
      · motif établi sur **deux jours distincts** au moins — reçu : 12 des 13
      vrais refus sont tombés le même après-midi, et un compteur brut y aurait
      lu « Bash : 12 refus, motif écrasant » ;
      · **jamais un outil nu** — on ne donne pas tout le shell pour douze
      commandes ;
      · **jamais une chaîne shell** — `git status && rm -rf /` commence par
      `git status` ;
      · **jamais une commande destructrice**, quel que soit le compteur. Douze
      refus de `rm -rf` ne sont pas douze arguments pour l'autoriser : ce sont
      douze fois où le garde a fait son travail. LA FRÉQUENCE N'EST PAS UN
      CONSENTEMENT.
      Reçu sur données réelles : 13 refus, **0 suggestion** — 10 chaînes shell,
      1 autre outil que Bash, `pwd` deux fois le même jour. La valeur est dans
      les raisons, pas dans la liste.
      Branché : outil MCP `autorisations-suggerees` (+ `RefusStore`).
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
- [–] **28 · ~~Client LSP~~** — **Écarté : le CLI le porte déjà.** Quatrième
  ligne fermée le 01/08 en fouillant le binaire, après les n°8, 54 et 7 — et
  celle-ci renverse un verdict que j'avais rendu deux heures plus tôt sur du
  raisonnement.
  J'avais conclu, à raison, qu'il n'y a pas de demi-mesure utile : ce qu'un
  LSP ajoute à `Grep` (trancher entre homonymes, suivre les ré-exports,
  renommer sans casser) est exactement la partie chère. J'en avais tiré « donc
  ça attend un créneau ». Faux : ça n'attend rien, c'est là.

      operation: "goToDefinition"   ·  findReferences   ·  workspaceSymbol
      documentSymbol  ·  hover  ·  diagnostics  ·  rename
      textDocument/definition  ·  textDocument/references
      « The symbol name or partial name to search for. Most language servers
        return no results for an empty query. »

  La dernière ligne est une description d'ARGUMENT montrée au modèle : c'est
  un outil, pas une dépendance interne. `agent/lsp/`

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

- [~] **37 · Architecture de passerelle** — **ses trois promesses sont
  tenues, par d'autres lignes que la sienne.**
  · _bail de tour_ — problème qu'on n'a pas : `Map<ThreadId, Context>` un
  pour un, dispatch sérialisé par file, worker qui prend un élément à la
  fois. Vérifié, pas supposé ;
  · _continuité de session ENTRE plateformes_ — déjà livrée : T3 a un
  client mobile natif complet qui parle au MÊME serveur par un relais,
  avec authentification Clerk. Un fil ouvert au bureau se reprend sur le
  téléphone ;
  · _slash universelles_ — livrées le 01/08 avec les n°44/45, dans un
  module partagé par toutes les plateformes.
  Ce qui restait vraiment de l'« architecture » a donc été écrit sous les
  n°38, 39, 40, 41 et 43 : sept décisions, toutes posées AVANT le premier
  octet réseau, dans l'ordre du garde avant le moteur.
  _(reste : rien de propre à cette ligne. Ce qui manque au bloc est le
  jeton de bot du n°42.)_
  `gateway/session.py` (3 307), `turn_lease.py`, `slash_commands.py` (5 483)
- [~] **38 · Streaming vers les messageries** — **la décision livrée le
  01/08.** L'agent écrit en flux, une messagerie reçoit des MESSAGES, et
  entre les deux trois contraintes qui n'existent nulle part ailleurs dans
  T3 : une taille max par message (Telegram 4096, Discord 2000), un rythme
  d'édition limité, et un refus d'inondation qui n'est PAS une panne mais
  une demande de ralentir.
  **Ce qu'on reprend d'eux, et c'est la trouvaille** : le repli adaptatif.
  Sur un refus on DOUBLE l'intervalle, on plafonne à 10 s, on compte les
  refus consécutifs, et au troisième on renonce aux éditions. C'est
  l'inverse du réflexe — réessayer au même rythme garantit le refus
  suivant. Une limite qu'on touche est un signal, pas un obstacle à forcer.
  **L'invariant qui prime sur tout** : la réponse finale part TOUJOURS,
  même après avoir renoncé aux éditions. Un flux dégradé reste une
  réponse ; un flux abandonné est un silence.
  Et le détail qui casse un rendu sans qu'on comprenne pourquoi : on ne
  coupe jamais au milieu d'un bloc de code. Une clôture ```orpheline
casse l'affichage de la messagerie pour TOUT le reste du message, pas
seulement pour le bloc.`stream*consumer.py` (2 250)
  *(reste : l'envoi lui-même, qui vient avec le premier adaptateur.)\_
- [~] **39 · Livraison fiable** — **la décision livrée le 01/08.** Ce qui
  compte n'est pas de réessayer, c'est de savoir QUOI réessayer.
  La distinction qu'on ne devine pas, et qu'ils documentent : un FIL
  supprimé n'est PAS un canal mort. Les deux erreurs se ressemblent —
  « message thread not found » contient « not found » — et les confondre
  condamnerait un groupe parfaitement vivant dont on a juste effacé un
  sujet. D'où l'ordre des contrôles, avec sa raison écrite.
  Pourquoi ça compte au-delà de l'élégance : une cible morte non détectée
  brûle une tentative dans l'enveloppe d'inondation de la plateforme à
  chaque tour — celle-là même que le n°38 ménage. Une cible morte dégrade
  donc la livraison vers les cibles VIVANTES.
  **L'auto-guérison est la moitié qu'on oublie** : toute livraison réussie
  efface la marque. Quelqu'un qui remet le bot dans son groupe repart sans
  rien nettoyer. Sans elle, la protection devient une punition définitive
  pour une panne temporaire, et il faut un geste d'administration que
  personne ne connaît.
  Quatre suites distinctes, jamais « ça a raté » : réessayer, réessayer
  SANS le fil, abandonner la cible, abandonner le message — un message
  malformé abandonne le MESSAGE, la cible n'y est pour rien.
  `gateway/dead_targets.py`, `delivery.py`, `delivery_ledger.py`
  _(reste : le journal de livraison lui-même, qui vient avec l'adaptateur.)_
- [~] **40 · Autorisation par utilisateur et par canal** — **la décision
  livrée le 01/08, AVANT le premier adaptateur.** Même ordre que le garde
  anti-zombie avant l'ordonnanceur : c'est elle qui rend le reste sûr.
  Ce qu'elle garde : un agent qui a `bypassPermissions` sur la machine
  d'Enzo, joignable depuis un groupe public, c'est une machine ouverte. Il
  n'y a pas de « on verra plus tard » possible ici.
  **La règle tient en un mot : REFUSER.** Chaque autorisation est un OUI
  explicite que quelqu'un a posé, jamais l'absence d'un non — une
  passerelle qui laisse passer faute de configuration est une passerelle
  ouverte.
  Repris d'eux mot pour mot, le piège qu'ils documentent : la délégation à
  un amont authentifié (notre relais) est légitime, mais le marqueur se
  compare à `true` STRICTEMENT — `is True` chez eux, « defensive against
  accidental fail-open ». Une chaîne `"true"` venue de JSON, un `1`, un
  objet de test auto-vivifié passeraient une vérification large, et chacun
  ouvrirait la passerelle en grand. Le test le vérifie sur sept valeurs.
  Deux détails qui viennent de l'usage : un message SANS expéditeur passe
  quand même si le canal est appairé (Telegram émet des messages
  d'administrateur anonyme et des diffusions), et la réponse au refus est
  volontairement PAUVRE — elle ne dit ni que l'agent existe, ni qui le
  possède, ni comment entrer. Un refus bavard sur un salon public est une
  invitation. `authz_mixin.py` (838)
  _(reste : l'appairage lui-même — le geste par lequel un canal devient
  autorisé — et son stockage. Ils viendront avec le premier adaptateur.)_
- [~] **41 · SDK d'ajout de plateforme** — **le contrat livré le 01/08.** Il
  relie les trois fondations (n°40 qui parle, n°38 comment le flux tient,
  n°39 quoi réessayer) à une plateforme réelle, et il est écrit pour que
  la QUATRIÈME plateforme coûte autant que la deuxième.
  Ce que « sans toucher au cœur » veut dire concrètement : ajouter Discord
  après Telegram doit être un fichier de plus, une entrée au registre,
  zéro ligne modifiée ailleurs. **Un test structurel le garde** — il
  refuse toute comparaison de nom de plateforme en dur dans le cœur, parce
  qu'un `if (plateforme === "discord")` ferait échouer le contrat EN
  SILENCE : ça marcherait quand même. Prouvé par mutation.
  Deux décisions dans le contrat lui-même : l'adaptateur rapporte
  l'erreur BRUTE sans la classer (`CibleMorte.ts` la classe pour toutes
  les plateformes d'un seul endroit — un adaptateur qui jugerait ferait
  diverger les verdicts, et une correction se ferait à un endroit sur
  trois) ; et un doublon de nom LÈVE au lieu de se laisser arbitrer par
  l'ordre du tableau.
  Le contrat est volontairement PETIT. Leur `platforms/` porte des
  adaptateurs de milliers de lignes ; l'essentiel n'y est pas. Un contrat
  qui grossit à chaque plateforme n'est plus un contrat, c'est la somme
  des cas particuliers.
  _(reste : le premier adaptateur qui l'implémente — c'est le n°42.)_
- [~] **42 · Telegram d'abord** — **la lecture livrée le 01/08**, et c'est là
  que sont les bugs. Le reste de l'adaptateur est deux appels HTTP ; la
  difficulté est qu'« une mise à jour Telegram » n'est pas une forme mais
  huit.
  Les cas qui comptent, et qui valident l'ordre dans lequel les modules
  ont été écrits : `channel_post` (une diffusion n'a PAS de `from`),
  `sender_chat` (un administrateur anonyme non plus), `edited_message`
  (lu comme neuf — corriger sa demande veut dire qu'elle doit compter), et
  `message_thread_id` lu SÉPARÉMENT du canal, parce que le n°39 en dépend.
  **Les trois premiers donnent un message sans expéditeur** — exactement
  pourquoi `QuiPeutParler` autorise par CANAL avant d'autoriser par
  personne. Un test rejoue une diffusion de canal de bout en bout à
  travers les deux modules.
  Deux détails qui mordraient plus tard : un identifiant reste une CHAÎNE
  (ceux de canal approchent 2^53, un `number` perdrait de la précision et
  deux canaux deviendraient le même), et on ne se rabat JAMAIS sur
  l'identifiant du groupe faute d'expéditeur — une autorisation posée sur
  une personne ouvrirait alors le groupe entier.
  _(reste : la connexion elle-même — jeton de bot, réception des mises à
  jour, envoi. Le jeton est une activation à demander à Enzo, M10.)_
- [~] **43 · Cycle de vie robuste** — **la décision livrée le 01/08**,
  dernière du bloc avant l'adaptateur réel.
  Une connexion échoue de DEUX façons, et la seconde est celle qui coûte :
  elle tombe (facile — on le voit), ou **elle reste ouverte et ne dit plus
  rien**. Un mandataire l'a coupée sans fermer la socket ; la socket paraît
  vivante, aucune erreur n'arrive, et le bot est muet pendant des heures
  sans que rien ne l'indique. Ça ne se détecte QUE par le silence.
  Fil-piège avec son reçu : Telegram répond à un long-poll au plus tard au
  bout de son propre délai (50 s par défaut), donc **90 s de silence ne
  peuvent pas être normaux**. Posé au-delà du sain, pas deviné.
  Ce qui ne se réessaie JAMAIS : un jeton refusé. Reconnecter ne le rendra
  pas valide, et s'acharner fait limiter puis bannir le bot. La passerelle
  RENONCE et le dit, avec le geste qui la remet en service.
  Et le décalage aléatoire n'est pas cosmétique : une coupure réseau
  générale fait redémarrer plusieurs instances ensemble, et un repli
  purement exponentiel les ferait toutes frapper à la même seconde. Il
  vient de l'APPELANT — une horloge cachée rendrait le module intestable.
  _(reste : la boucle de connexion elle-même, qui vient avec le jeton.)_
- [~] **44 · `/handoff`, `/sethome`, `/platforms`** — **la lecture livrée le
  01/08**, avec le n°45 : les deux lignes partagent le même module, parce
  qu'une commande de passerelle se reconnaît de la même façon quelle que
  soit ce qu'elle fait ensuite.
  **Le piège est spécifique aux messageries** : dans un salon partagé,
  plusieurs bots écoutent, et Telegram suffixe les commandes
  (`/start@monbot`). Un bot qui ignore le suffixe répond aux commandes de
  ses voisins — deux agents parlent en même temps et l'humain ne sait pas
  lequel lui a répondu. L'inverse mord aussi : exiger le suffixe rendrait
  le bot muet en tête-à-tête.
  Et le cas qu'on n'anticipe pas : une barre oblique ne fait pas une
  commande. `/usr/local/bin` collé dans un salon est un chemin. Répondre
  « commande inconnue » apprendrait à ne plus rien coller — les chemins
  passent donc comme messages ordinaires.
  L'aide est écrite ICI et pas dans l'adaptateur : une aide qui diverge
  d'une messagerie à l'autre est pire qu'une aide absente, elle enseigne
  des commandes qui n'existent pas ailleurs. Un test vérifie qu'aucune
  commande reconnue n'y manque.
  _(reste : ce que chaque commande FAIT — dépend de l'adaptateur connecté.)_
- [~] **45 · `/clarify` depuis la passerelle** — **la LECTURE livrée le 01/08** (voir la note du n°44 ; les deux lignes partagent le même module).
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
- [–] **50 · ~~Hub de skills~~** — **Écarté : le CLI porte déjà tout le hub.**
  Sixième famille fermée par la fouille du binaire, et celle-ci emporte trois
  lignes d'un coup (50, 52, 53). Les chaînes :

      agentskills.io
      marketplace manifest entries for commands/agents/skills/hooks/
        outputStyles/themes/syntaxHighlighting
      strictKnownMarketplaces
      Policy-list sentinel for the ~/.claude/skills/ auto-load

  Tout y est : le registre que le n°53 nomme explicitement
  (**agentskills.io**), l'installation depuis un marketplace, la politique
  d'allowlist des sources (`strictKnownMarketplaces`), et le chargement
  automatique depuis `~/.claude/skills/`.
  **Conséquence pour la question qui attendait Enzo** : elle n'a plus lieu
  d'être. T3 n'a pas besoin d'une permission d'installer des skills dans son
  home — Claude Code le fait déjà, avec sa propre politique de sources. Ce que
  T3 ajoute reste l'INSPECTION avant de prendre (`inspecter-skill`, n°10), et
  c'est bien la moitié qui manquait : le marketplace installe, il ne scanne
  pas le contenu contre 121 motifs de menace.
  `tools/skills_hub.py` (4 151)

- [~] **51 · Les skills d'Hermès** — **TRIÉES le 01/08**, le travail de
  regarder est fait ; reste la décision de prendre.
  D'abord un fait : elles sont **69**, pas 182, et il n'y a **pas de
  famille `security`**. Le chiffre du catalogue venait du dépôt GitHub,
  pas de ce qu'on a sur disque.
  `scripts/trier-skills-hermes.ts` leur applique nos deux contrôles déjà
  écrits — le scanner (n°10) et les normes (n°4) — et rend un tableau.
  **Deux résultats qui comptent** :
  · **leurs 69 descriptions pèsent 3 801 caractères. Nos 18 en pèsent
  ~8 400.** Leurs skills coûtent moins de la moitié des nôtres, à
  presque quatre fois le nombre. Aucune ne dépasse notre limite de 240 ;
  la nôtre est dépassée par 15 sur 18. C'est la démonstration du n°4 par
  l'exemple, et elle vient de chez eux ;
  · **30 sur 69 sont refusées** en confiance « communauté », et les motifs
  sont vérifiables un par un : `curl` d'exfiltration, accès SSH,
  modification de la config git globale, `curl | sh`. Le mode détail du
  script les nomme (`… <racine> <skill>`).
  _(reste : la DÉCISION de prendre, et lesquelles. Elle touche ce qui se
  charge dans chaque session de T3 — donc Enzo. À noter pour ce
  choix : `exfil-curl` est classé « critique », donc toute skill qui
  appelle une API HTTP est refusée d'une source communautaire. C'est le
  bon défaut pour une installation automatique ; c'est peut-être trop
  strict pour un choix humain éclairé.)_
- [–] **52 · ~~Bundles de skills~~** — **Écarté : le CLI porte un marketplace complet.** Vérifié le 01/08 dans son binaire — voir le n°50.
- [–] **53 · ~~Compatibilité agentskills.io~~** — **Écarté : le CLI porte un marketplace complet.** Vérifié le 01/08 dans son binaire — voir le n°50.
- [–] **54 · ~~Conduite fine de session~~** — **Écarté : les trois
  comportements existent DÉJÀ sous nous.** Vérifié le 01/08 dans le binaire du
  CLI que T3 lance, la même fouille qui a fermé le n°8 :
  · **file d'attente** — `queuedCommands`, `pendingUserMessages`,
  `messageQueue`, `getQueuedCommandAttachments`, et la phrase montrée à
  l'humain : **« Message queued for the main conversation's next turn. »**
  Un log confirme que le chemin est exercé (« dropping images for one queued
  command, keeping its text ») ;
  · **infléchissement** — c'est ce que T3 fait déjà : « a sendTurn while a
  real turn is running is a steer », dans les quatre adaptateurs ;
  · **interruption** — le SDK porte un sous-type de commande `interrupt`, et
  T3 s'en sert (un tour coupé passe à `interrupted`).
  Ce qu'ajoute leur chantier est donc un RÉGLAGE — quel comportement Entrée
  déclenche — pas un mécanisme. Ce réglage appartient à la surface qui reçoit
  la frappe, pas à T3, et le réimplémenter doublerait trois chemins qui
  marchent.
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

- [–] **64 · ~~Computer use~~** — **Écarté le 01/08 sur MA décision, renversable d'un mot.** Le toolkit `preview` fait
  déjà, sur un NAVIGATEUR, tout ce que la ligne demande : `open`,
  `navigate`, `click`, `type`, `press`, `scroll`, `snapshot`, `evaluate`,
  `wait_for`, `resize`, `recording_start/stop` — quatorze poignées, toutes
  derrière la porte de sortie.
  Ce que « computer use » ajoute, c'est le contrôle du BUREAU entier :
  cliquer dans Figma, piloter Slack. Deux raisons de ne pas le prendre —
  ce n'est pas notre métier (T3 fait du code, et le code vit dans un
  éditeur et un navigateur), et c'est la surface d'attaque la plus large
  qu'on puisse s'ajouter, puisqu'une page web hostile pourrait piloter
  toute la machine. Notre réponse actuelle borne le dégât au navigateur.
  Je tranche parce que l'argument est technique autant que produit et que
  l'annulation ne coûte rien : si tu veux le bureau, dis-le et la ligne
  rouvre. (M2 : je donne une reco et je l'applique quand elle est
  défendable et réversible — je ne bloque pas sur un avis.)
- [~] **65 · Mot d'éveil** — **la décision livrée le 01/08.** On ne reprend
  PAS leurs trois moteurs ONNX : ils répondent à une contrainte de basse
  consommation — un détecteur minuscule toujours allumé, pour n'allumer la
  reconnaissance complète qu'après. T3 tourne sur une machine de bureau
  branchée, et `voice-core` porte déjà la VAD et la transcription en flux.
  On écoute donc ce qui est déjà transcrit, et il ne reste que la décision.
  **Leur invariant est tenu, et par construction** : aucun audio ne sort
  de la machine, puisque ce module ne voit que du TEXTE produit localement.
  Trois bornes, et chacune répond à une façon d'échouer :
  · la **distance** tolère les erreurs de transcription, avec les
  TRANSPOSITIONS comptées pour une seule correction — c'est l'erreur la
  plus fréquente, et Levenshtein simple mettrait « raptro » aussi loin
  de « raptor » qu'un mot sans rapport ;
  · la **première lettre** doit correspondre. « captor » et « rapton » sont
  tous deux à UNE correction de « raptor » et aucune distance ne les
  sépare ; on reconnaît un mot d'éveil à son attaque, c'est ce qu'on
  entend en premier et ce que la transcription rate en dernier ;
  · la **position** — le mot d'éveil ouvre la phrase. « Il faudrait un
  raptor pour ce travail » n'est pas un appel, et le laisser passer
  réveillerait l'agent pendant une conversation qui ne le concerne pas.
  C'est le genre d'erreur après quoi on coupe le micro.
  Plus un repos de 2 s : la transcription en flux rend le même segment
  plusieurs fois, et sans repos la fin de la phrase qui a réveillé l'agent
  le réveille encore. `tools/wake_word.py` (1 267)
  _(reste : brancher la boucle audio — écouter en continu et passer chaque
  segment transcrit à ce module.)_
- [~] **66 · TTS en streaming** — **le découpage livré le 01/08**, et il est
  toute la difficulté. On ne reprend PAS leur pile : T3 est Electron, donc
  Chromium, donc `speechSynthesis` est déjà là — zéro dépendance, zéro
  modèle à télécharger, et les voix système de macOS sont excellentes. Ce
  qu'il fallait écrire n'est pas le moteur, c'est ce qu'on lui donne.
  Attendre la fin du message ferait perdre l'intérêt du flux : on
  entendrait la réponse une fois qu'on a fini de la lire. Parler à chaque
  fragment donnerait un hachis, parce que le moteur redémarre sa prosodie
  à chaque appel. Il faut rendre une unité DÈS qu'elle est complète et
  jamais avant — tout est là.
  Ce qui casse une détection naïve, et que le module traite : les
  abréviations (« M. Dupont », « etc. »), les nombres (`0.0.51`), les noms
  de fichiers (`config.ts`), et à l'inverse les paragraphes SANS
  ponctuation — un titre n'a pas de point, et attendre le sien laisserait
  la voix muette.
  Ce qui ne se prononce pas devient ce qu'une oreille peut en faire : un
  bloc de code devient « un bloc de 12 lignes », une URL devient « un
  lien ».
  14 tests, dont celui qui rejoue de VRAIS fragments successifs et vérifie
  qu'aucune unité ne part deux fois.
  _(reste : l'appel à `speechSynthesis` et le bouton qui l'active — c'est
  de l'interface, donc le ton et le geste appartiennent à Enzo.)_
- [–] **67 · ~~Kanban~~** — **Écarté le 01/08 sur ma décision, renversable
  d'un mot.** 10 010 lignes pour une décomposition en tâches, un essaim
  d'agents et des watchers. T3 a déjà les FILS : un par chantier, avec son
  historique, ses checkpoints et sa reprise. Un kanban par-dessus serait un
  second modèle de suivi à tenir cohérent avec le premier — la couche que la
  RÈGLE SUPRÊME refuse tant qu'on n'a pas le problème. À rouvrir le jour où un
  chantier réel se perd faute de tableau. `kanban_db.py` (10 010)
- [x] **68 · Projets** — sélecteur de projet (⌘P) et recherche de contenu (⇧⌘F), livrés en amont.

- [~] **69 · Génération d'images et de vidéos** — **le GARDE livré le 01/08,
  avant le moteur** — comme le garde anti-zombie avant l'ordonnanceur et
  l'autorisation avant l'adaptateur de passerelle.
  Celui-ci n'est pas facultatif, parce que la panne qu'il empêche est la
  plus coûteuse de nos formes habituelles : chaque appel RÉUSSIT, chaque
  appel est facturé, et rien ne dépasse jusqu'au relevé. Un agent qui
  n'aime pas un résultat réessaie ; la facture court.
  **La règle : pas de budget, pas de dépense.** Un budget absent ne veut
  pas dire « illimité », il veut dire que personne n'a décidé — et
  personne n'a décidé veut dire non.
  Ce qu'on refuse aussi, et qui surprend : une demande DÉJÀ servie. Le même
  texte rendra la même image, à la variation près ; la refaire coûte deux
  fois pour la même chose. Le refus dit de CHANGER la demande, pas de
  réessayer. L'empreinte est normalisée — sinon une majuscule contournerait
  le garde.
  Alerte à 80 %, comme le seuil de quota des comptes : à 100 % il est déjà
  trop tard, la génération suivante est refusée au milieu d'un travail.
  _(reste : le fournisseur lui-même — DALL·E, Imagen, autre. Ça engage de
  l'argent : le choix et le plafond appartiennent à Enzo, M2.)_
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

- [ ] **77 · i18n — 17 langues** — **RIEN N'EST LIVRÉ, et cette ligne a menti.**
      Elle était cochée au motif que « des locales existent déjà côté paquets ».
      Des fichiers de locale dans des dépendances ne sont pas un réglage : mesuré
      le 01/08, `apps/web/src` ne contient AUCUN sélecteur de langue d'interface —
      les seules occurrences de `locale` servent au formatage des dates
      (`timestampFormat.ts`, `session-logic.ts`). Enzo avait envoyé les réglages
      d'Hermès en exemple ; il a cru sa demande perdue, et la case cochée est ce
      qui le lui a fait croire. Une case qui déclare fait ce qui ne l'est pas est
      pire qu'une case vide : elle éteint la question.
      **La justification était fausse DEUX fois** — vérifié le 01/08 :
      `find apps packages` ne rend aucun dossier `locales`/`i18n`/`lang`, aucun
      `.ftl`, aucun `en.json`/`fr.json`, et `apps/web/package.json` ne dépend
      d'aucun moteur (`i18next`, `intl`, `lingui`, `fluent`). Les « locales côté
      paquets » vivaient dans `node_modules` : elles ne traduisent rien de NOTRE
      interface.

  **Deux chantiers différents dorment sous le même mot « langue ». Les
  confondre est ce qui a produit la case cochée.**

  1. **La langue de RÉPONSE de l'agent** — petit, borné, utile tout de suite :
     un réglage qui ajoute une consigne de langue au prompt système. Aucune
     traduction à écrire, rien à extraire. C'est ce que la plupart des outils
     d'agent appellent « changer la langue », et vraisemblablement ce
     qu'Enzo a vu chez Hermès.
  2. **La langue de l'INTERFACE** — gros : moteur i18n, extraction de toutes
     les chaînes de `apps/web`, traductions, tests de non-régression. Un
     sélecteur posé avant ce travail n'est qu'une coquille — exactement le
     genre de « livré » qui a déjà éteint cette demande une fois.

  **Reco : faire le 1, et n'ouvrir le 2 que sur décision explicite d'Enzo**
  (c'est un chantier de produit, pas une case de catalogue). Ne PAS recocher
  cette ligne tant que l'un des deux n'est pas réellement dans l'interface.

- [–] **87 · Sauter le résumé de compaction quand il ne peut rien gagner** —
  première prise de la VIGIE (01/08), et premier écart motivé.

  **L'idée est excellente.** Hermès (`8daf0306`) : avant de payer un appel LLM
  de résumé, vérifier qu'il peut réellement libérer des tokens. Si la section
  centrale fait moins de 10 % du seuil ET qu'une inefficacité a déjà été
  constatée, on saute l'appel et on retombe sur la suppression déterministe.
  Sans ce garde, une session lourde en outils **brûle 500 s** pour remplacer
  quelques messages légers par un gain négligeable. Leur soin du détail vaut
  d'être noté : un compteur de « sauts » SÉPARÉ de celui des échecs, pour
  qu'un saut délibéré ne verrouille jamais la compaction ; et un journal en
  info, pas en avertissement, parce que c'est une optimisation, pas une panne.

  **Écarté quand même, et voici le reçu** : `apps/server/src` ne contient
  AUCUNE compaction — vérifié le 01/08, zéro `compact`/`summarize` dans un
  chemin de conversation. C'est le SDK `@anthropic-ai/claude-agent-sdk` qui
  compacte pour nous. Il n'y a donc rien où brancher ce garde : le coût qu'il
  évite n'est pas le nôtre à payer, et le code qui le paierait ne nous
  appartient pas.

  **À rouvrir si — et seulement si — on reprend la compaction en main.** Ce
  jour-là, c'est la conception à copier. En attendant, construire notre propre
  compaction POUR pouvoir y mettre ce garde serait résoudre un problème qu'on
  n'a pas.

- [x] **86 · NOTIFICATIONS NATIVES DE BUREAU — les QUATRE événements livrés le
      01/08.** `notifyOnApproval`, `notifyOnInput`, `notifyOnFailure`,
      `notifyOnCompletion` : le quatuor du contrat, câblé sur la surface bureau.

  **Livré** : `apps/web/src/components/chat/useNotificationsDeBureau.ts`,
  appelé depuis `ChatView.tsx:2118` (import l. 232 — appelant VÉRIFIÉ, pas
  supposé : c'est l'étape que je rate). Prévient sur _approbation attendue_ et
  _saisie attendue_, uniquement fenêtre non regardée. La décision est extraite
  en fonction PURE `aviserOuSeTaire`, testée sans monter de composant — comme
  `session-logic.ts` — parce que `@testing-library/react` n'est pas au dépôt et
  qu'une dépendance pour un test ne se justifiait pas. 6 tests, dont **quatre
  de SILENCE** : c'est là qu'est la valeur, une notification de trop apprend à
  ignorer le canal.

  **L'ordre des avis est un choix** : ce qui BLOQUE (approbation, saisie) passe
  devant ce qui informe (échec, fin de tour). Un tour qui attend ton feu vert
  ne repartira jamais seul ; un tour fini a déjà rendu son travail. Jamais deux
  avis d'un coup — deux notifications simultanées, c'est la moitié qui ne sera
  pas lue. Et l'échec prime la complétion : un tour qui plante retombe AUSSI,
  annoncer « réponse prête » pour un tour qui vient d'échouer serait le pire
  message possible (cas figé au banc).

  **Sur les transitions, jamais sur l'état** : apparition de l'erreur (pas sa
  présence, sinon elle re-sonnerait tant qu'elle reste affichée), retombée du
  tour (pas son arrêt — au repos `tourEnCours` est faux en permanence, et on
  sonnerait sans fin). Deux cas de banc gardent précisément ça.

  **Reste à faire, et ce n'est PAS bloquant** : les RÉGLAGES. Les quatre
  bascules d'Hermès, le son de fin et le bouton de test n'existent pas côté
  bureau ; la permission du navigateur fait office d'interrupteur unique, et on
  ne la redemande jamais de force. À ouvrir si le canal se révèle trop bavard
  à l'usage — pas avant, on ne règle pas un problème qu'on n'a pas.

  Relevé le 01/08 en comparant les réglages d'Hermès aux nôtres.

  **Ce n'est PAS une fonctionnalité à inventer.**
  `packages/contracts/src/relay.ts:65` porte déjà exactement le quatuor
  d'Hermès — `enabled`, `notifyOnApproval`, `notifyOnInput`,
  `notifyOnCompletion`, `notifyOnFailure` — plus la portée
  `agent_activity_notifications` (l. 210) et le genre `push_notification`
  (l. 836). Mais tout ça ne sert qu'au **relais push** (mobile / distant).
  L'app de BUREAU, la seule qu'Enzo utilise, n'en tire rien.

  **Ce que ça a coûté, le jour même où on l'a trouvé.** Enzo est resté bloqué
  des heures sur des demandes d'approbation qu'il ne voyait pas, fenêtre en
  arrière-plan. Rien ne l'a prévenu. C'est le manque de la liste qui a déjà
  fait perdre une journée entière.

  **Point d'ancrage repéré, et son piège.** L'événement arrive dans
  `apps/web/src/session-logic.ts:393` (`activity.kind === "approval.requested"`),
  et les genres y sont déjà classés (`command` / `file-read` / `file-change`,
  l. 382-390). MAIS `session-logic.ts` est un module de logique PURE, couvert
  par `session-logic.test.ts` : y déclencher une `Notification` y planterait un
  effet de bord. Le câblage doit passer par un abonné React qui observe ces
  activités, pas par la logique elle-même.

  **Deux exigences pour que ce soit utile et pas du bruit** : ne notifier que
  fenêtre NON focalisée (sinon ça double le toast déjà présent), et réutiliser
  le quatuor du contrat plutôt que d'en réinventer un — deux taxonomies pour
  la même chose divergeraient en silence.

  **Reco : c'est le n°1 de la liste des manques face à Hermès**, devant les
  réglages de sous-agents. Il est petit (câblage d'un contrat existant vers une
  surface) et il répare une douleur mesurée, pas supposée.

- [–] **78 · Vue focus, moteur console, UI curses de repli, presse-papier** — T3 est Electron : une UI terminal de repli répond à un produit qui vit dans un terminal.

- [~] **79 · Bannière, onboarding, tips** — **la DÉCISION livrée le 01/08 ;
  le texte reste à Enzo.** Ce qui n'est pas du goût : choisir QUELLE
  astuce montrer.
  Un tirage au sort répète — sur six astuces, on revoit la même avant d'en
  découvrir la moitié, et une astuce déjà lue apprend à ne plus les lire.
  L'ordre fixe ne vaut pas mieux : il montre la première à quelqu'un qui
  la connaît par cœur et enterre la dernière.
  **La règle : parler de ce qu'on N'A PAS FAIT.** Chaque astuce nomme une
  capacité ; on montre celle dont la capacité n'a jamais servi, mesurée sur
  l'usage réel. C'est la seule qui puisse apprendre quelque chose — les
  autres décrivent ce que l'humain fait déjà.
  **Et quand tout a servi, on se TAIT.** Une bannière qui parle encore une
  fois la découverte finie devient du bruit, et le jour où on aura vraiment
  quelque chose à dire, personne ne regardera plus cet endroit. Un second
  export existe pour que l'interface n'affiche RIEN — pas de cadre vide.
  Un test rejoue un parcours complet : les six astuces sortent, sans un
  doublon. C'est ce qu'un tirage au sort rate.
  _(reste : le TEXTE. Les six astuces livrées sont des brouillons de
  FAITS vérifiables sur T3 ; le ton et la voix appartiennent à Enzo.)_
- [–] **80 · ~~Achievements + Petdex~~** — **Écarté le 01/08 sur MA décision, renversable d'un mot.** Ce n'est pas une question de
  faisabilité, c'est une question de TON. Les badges et le petdex fêtent
  l'usage de l'outil ; T3 sert à finir un travail, et l'humain qui le
  referme doit avoir livré, pas collectionné.
  Le risque n'est pas cosmétique : une progression qu'on récompense
  pousse à faire PLUS de tours, alors que le bon tour est celui qu'on n'a
  pas eu besoin de faire. On mesurerait le contraire de ce qui compte.
  Je tranche, et je le dis franchement : sur le TON, ton avis vaut plus
  que le mien. Mais laisser la ligne en suspens ne sert personne — un mot
  de toi la rouvre.
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

- [–] **88 · Réglages de SOUS-AGENTS (effort, parallélisme, limites)** — je
  l'avais annoncé « manque n°1 » face à Hermès le 01/08. **C'était faux, et le
  reconnaître vaut mieux que livrer la coquille.**

  Vérifié : les seules occurrences de « subagent » dans notre code
  (`ClaudeAdapter.ts:634, 866-896`) servent à ÉTIQUETER les appels d'outils
  dans l'interface. Aucun levier de contrôle. Hermès règle ses sous-agents
  parce qu'il implémente sa PROPRE orchestration ; la nôtre vit dans le SDK
  `@anthropic-ai/claude-agent-sdk`, qui ne l'expose pas.

  Un panneau « Subagent effort / parallel / timeout » chez nous serait donc du
  décor : des curseurs que rien ne lit. Exactement le « livré » qui ment, déjà
  payé sur l'entrée 77.

  **À rouvrir seulement si** le SDK expose ces réglages, ou si on reprend
  l'orchestration des sous-agents en main.

- [–] **89 · Budget de réflexion (`maxThinkingTokens`)** — levier RÉEL mais
  écarté, et la distinction compte.

  Trouvé le 01/08 : `ClaudeAdapter.ts:233` déclare
  `setMaxThinkingTokens(number | null)`. Une seule occurrence dans tout le
  dépôt — la déclaration. **Personne ne l'appelle.** C'est donc, contrairement
  aux sous-agents, quelque chose qu'on POURRAIT brancher.

  Écarté quand même : aucune plainte, aucun symptôme, aucun coût mesuré sur le
  budget de réflexion. Les niveaux d'effort (Low → Max) couvrent déjà cette
  dimension grossièrement. Le brancher résoudrait un problème qu'on n'a pas —
  et la règle suprême dit que le plus gros gain de simplicité est de REFUSER
  ce problème-là.

  **Le rouvrir demanderait un reçu** : une mesure montrant que le budget par
  défaut coûte ou bride quelque chose.

- [~] **90 · Classer le menu `/` par usage réel** — deuxième prise de la VIGIE
  (01/08). La moitié du problème n'existe pas chez nous ; l'autre moitié est à
  portée de main.

  **Ce qu'ils ont corrigé** (`609cd28b`) : leur menu `/` était une tranche
  plate des 30 premiers résultats, et le compléteur émet TOUTES les commandes
  avant la première skill. Sur une installation à 230 skills, un `/` nu
  remplissait les 30 lignes de commandes et n'offrait **aucune** skill.

  **Leur règle est fine, et c'est elle qui vaut d'être retenue** : un `/` nu est
  du SURVOL — on élague les skills livrées jamais ouvertes, c'est du bruit. Une
  requête tapée est une RECHERCHE — « une recherche qui cache une
  correspondance est cassée », donc on n'élague rien, on réordonne seulement.

  **La moitié qui ne nous concerne pas** : notre menu ne tranche pas, il
  GROUPE (`ComposerCommandMenu.tsx:86-103` — Skills / Built-in / Provider). Les
  skills ont leur propre section et ne peuvent pas être écrasées par les
  commandes. Le bug qu'ils ont corrigé n'existe donc pas ici.

  **La moitié qui nous concerne, et la donnée EXISTE DÉJÀ** : notre section
  Skills n'est pas classée par usage. Or `apps/server/src/skills/UsageDesSkills.ts`
  compte déjà les invocations. Ce qui manque n'est pas la mesure, c'est le
  chemin : le menu web ne voit pas cette donnée (vérifié — zéro occurrence
  d'« usage » dans `ComposerCommandMenu.tsx`).

  **Reste à faire** : exposer le compte d'usage jusqu'au menu, puis trier la
  section Skills par usage décroissant, A-Z à égalité. Ne PAS reprendre leur
  élagage du `/` nu tant qu'on n'a pas leur problème — on a bien moins de
  skills, et élaguer ce qu'on ne voit pas encore serait résoudre un problème
  qu'on n'a pas.
