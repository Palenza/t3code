# Veille — pi · InsForge · gstack, confrontés à Raptor

Même méthode que `CHANTIER-HERMES.md` : on inventorie TOUT (chaque dossier,
chaque sous-dossier, chaque fichier), on mesure au lieu de recopier, et on
confronte à ce que Raptor a **déjà** — vérifié dans le code, jamais déduit.

**Ce que « 100 % » veut dire ici, et ce qu'il ne veut pas dire.** L'arbre est
couvert intégralement : 4 179 fichiers, 723 dossiers, jusqu'à 9 niveaux de
profondeur, tous énumérés et pesés. Je n'ai pas LU les 601 138 lignes. La
lecture est ciblée sur ce qui touche Raptor. Dire l'inverse serait la mine que
H4 nomme.

## Les chiffres, mesurés le 01/08/2026

Aucun n'est recopié d'un README ou d'un post — tous viennent de `gh api` ou de
`wc -l` sur le dépôt cloné le jour même.

| dépôt                    |       ★ |  forks | licence    | créé    | code (l.) | fichiers | dossiers |
| ------------------------ | ------: | -----: | ---------- | ------- | --------: | -------: | -------: |
| **garrytan/gstack**      | 125 515 | 18 827 | MIT        | 2026-03 |   179 160 |    1 177 |      159 |
| **earendil-works/pi**    |  81 467 | 10 055 | MIT        | 2025-08 |   237 155 |    1 256 |      151 |
| **InsForge/InsForge**    |  12 606 |  1 109 | Apache-2.0 | 2025-07 |   184 823 |    1 746 |      413 |
| **Raptor** _(référence)_ |       — |      — | —          | —       |   424 131 |        — |        — |

Raptor porte en plus **193 383 lignes de tests**. Aucun des trois n'approche ce
rapport : c'est le seul axe où l'écart est massif et en notre faveur.

---

## 1 · Les forks d'InsForge — la question est close

Demande : « tous les forks qui ont du code en plus ».

**Réponse mesurée : il n'y en a aucun.** Sur les **1 195 forks** listés :

- comparaison `ahead_by` sur la branche par défaut → **0 fork en avance** ;
- puis, parce que le défaut ne prouve rien, **toutes les branches** de tous les
  forks confrontées aux 376 sommets de l'amont → **0 branche inconnue**.

Contrôle anti-silence, parce qu'un zéro peut venir d'une commande muette :
échantillon de 40 forks, **40 ont rendu des branches, 836 branches lues**, et un
SHA inconnu aurait bien été détecté. Le zéro est une mesure, pas une absence de
mesure.

Ce sont des copies de vitrine — `behind_by` va jusqu'à **926 commits**. Il n'y a
rien à y prendre, et c'est une bonne nouvelle : ça retire un chantier entier.

---

## 2 · InsForge — autre catégorie, et c'est le point

« The all-in-one, open-source backend platform for agentic coding ». Ce n'est
pas un client d'agent : c'est un **Supabase pour agents**, que l'agent
provisionne lui-même.

| module      | l.    | module     | l.  |
| ----------- | ----- | ---------- | --- |
| payments    | 9 813 | secrets    | 950 |
| database    | 6 128 | functions  | 846 |
| auth        | 3 550 | realtime   | 801 |
| storage     | 1 985 | email      | 757 |
| deployments | 1 518 | schedules  | 530 |
| ai          | 1 188 | memory     | 363 |
| compute     | 1 083 | webscraper | 247 |

**Recouvrement avec Raptor : quasi nul.** Raptor ne vend pas de backend et n'a
aucune raison d'en héberger un. Le seul lien réel est que leur plugin Claude
Code vit dans un AUTRE dépôt (`InsForge/insforge-skills`) — la marketplace ici
n'est qu'une entrée.

**À ne PAS prendre**, et la règle suprême le dit mieux que moi : ce sont des
solutions à des problèmes qu'on n'a pas. Les 9 813 lignes de paiements sont un
produit entier, pas une fonctionnalité.

---

## 3 · pi — le vrai pair architectural

Le seul des trois qui fait le même métier que Raptor : un harnais d'agent de
code. 9 paquets.

| paquet           |      l. | ce que c'est                              |
| ---------------- | ------: | ----------------------------------------- |
| **coding-agent** | 115 832 | le CLI, ses outils, ses modes             |
| **ai**           |  55 347 | API LLM unifiée, 15+ fournisseurs, images |
| **tui**          |  29 030 | rendu terminal différentiel               |
| **agent**        |  18 941 | boucle d'agent, transport, état           |
| **server**       |   5 678 | serveur expérimental                      |
| **client**       |   1 945 | client distant sur CBOR                   |
| **protocol**     |   1 902 | protocole CBOR pour sessions distantes    |
| **evals**        |   1 774 | évaluations                               |
| **storage**      |   1 598 | persistance                               |

Leur `coding-agent/src/core` (27 951 l., 73 fichiers) porte l'essentiel :
`agent-session` 3 332 · `package-manager` 2 625 · `session-manager` 1 712 ·
`settings-manager` 1 260 · `resource-loader` 1 096 · `compaction` 969 ·
`model-resolver` 726 · `provider-composer` 548 · `skills` 487.

**Leur choix fondateur, écrit noir sur blanc** : _pas_ de MCP intégré, _pas_ de
sous-agents, _pas_ de popup de permission, _pas_ de mode plan, _pas_ de todos,
_pas_ de bash en tâche de fond — « tout est constructible en extension ».

C'est l'exact inverse de Raptor, et ce n'est pas un défaut de l'un ou de
l'autre : eux vendent un noyau minimal extensible, nous livrons un produit
complet. **Prendre leur minimalisme serait défaire Raptor.** Ce qui se prend,
ce sont des pièces isolées.

### Ce que pi a et que Raptor n'a PAS — vérifié dans notre code

| pièce                                    |                                     l. chez eux | état chez nous                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **extensions tierces en TS**             | 1 391 + 1 713 types + 1 236 runner + 713 loader | **absent**. On a les skills (données), pas le code tiers exécutable                                                                                                        |
| **gestionnaire de paquets d'extensions** |                                           2 625 | **absent**. Installer une extension depuis npm/git                                                                                                                         |
| **gabarits de prompt versionnés**        |                                             285 | **absent** — et c'est le plus gênant : notre I3 Palenza EXIGE « prompt = code versionné ». On a un `systemPrompt` dans l'adaptateur, pas un système                        |
| **protocole distant CBOR**               |                                   1 902 + 1 945 | **absent**. On a notre relais mobile — le besoin est déjà servi autrement                                                                                                  |
| **export HTML / partage en gist**        |                                             316 | **absent** (les correspondances « export » chez nous sont de la transcription vocale)                                                                                      |
| **arbre de session avec branchement**    |                                           1 712 | **partiel**. On a les checkpoints et le rembobinage (`CheckpointStore`, `restoreCheckpoint`) ; pas l'arbre étiqueté/filtrable                                              |
| **compaction en propre**                 |                  969 + 376 branch-summarization | **délégué au SDK** (`compactsAutomatically`). Choix d'architecture, même raison qu'Hermès : on garde notre moteur                                                          |
| **couche modèles multi-fournisseurs**    |                                          55 347 | **différent**. On a comptes Max + rotation. Leur atout propre : la génération d'IMAGES est déjà câblée (`images-api-registry`) — or c'est notre activation n°69 en attente |

---

## 4 · gstack — pas un harnais, une BIBLIOTHÈQUE DE MÉTHODE

125 515 ★ en cinq mois, et la surprise en ouvrant : ce n'est pas un moteur.
C'est **59 skills** pour Claude Code, plus un moteur de navigation.

Les dossiers « sans code » sont les skills. Les 59, telles quelles :

`autoplan` `benchmark` `benchmark-models` `browse` `canary` `careful` `codex`
`context-restore` `context-save` `cso` `design-consultation` `design-html`
`design-review` `design-shotgun` `devex-review` `diagram` `document-generate`
`document-release` `freeze` `gstack-upgrade` `guard` `health` `investigate`
`ios-clean` `ios-design-review` `ios-fix` `ios-qa` `ios-sync` `land-and-deploy`
`landing-report` `learn` `make-pdf` `office-hours` `open-gstack-browser`
`pair-agent` `plan-ceo-review` `plan-design-review` `plan-devex-review`
`plan-eng-review` `plan-tune` `qa` `qa-only` `retro` `review` `scrape`
`setup-browser-cookies` `setup-deploy` `setup-gbrain` `ship` `skillify` `spec`
`sync-gbrain` `unfreeze` + 4 variantes `openclaw`.

**Le parallèle qui saute aux yeux** : `plan-ceo-review` / `plan-eng-review` /
`plan-design-review` / `plan-devex-review`, c'est notre skill `panel` de
Palenza, découpée en quatre lentilles séparées. Et `spec` ↔ `spec-avant-code`,
`ship` ↔ `livraison-propre`, `guard` ↔ `garde-honnetete`, `qa` ↔
`verifier-palenza`. **On a convergé sans se copier** — c'est le signal le plus
fort de la veille : ces formes-là sont les bonnes.

### Les deux choses de gstack qui valent un regard

**`model-overlays/`** — une surcouche de prompt PAR MODÈLE : `claude.md`,
`gemini.md`, `gpt.md`, `gpt-5.4.md`, `o-series.md`, `opus-4-7.md`. Chacune
corrige les travers connus du modèle visé (leur `claude.md` : discipline de
todo-list, annoncer l'approche avant une action lourde, préférer les outils
dédiés à Bash).

Chez nous : **absent**, vérifié. Et Raptor route DÉJÀ plusieurs fournisseurs
(Claude, Codex, Grok, Cursor, OpenCode) avec un seul jeu d'instructions. C'est
la piste la plus directement applicable des trois dépôts.

**`browse/`** — 51 870 l. : serveur, gestionnaire de navigateur, import de
cookies, agent terminal, commandes d'écriture. Chez nous, le pilotage de
navigateur existe (`preview_*` en MCP, `desktop/src/ipc/methods/preview.ts`) et
la skill `debug-navigateur` en fait une LOI (M12). Leur import de cookies pour
atteindre des pages authentifiées est la seule pièce qu'on n'a pas vue chez
nous — à instruire, pas à conclure.

---

---

## 5 · LES BRANCHES — 908 creusées, couverture 100 %

Les trois `main` ne montrent qu'une part du travail. Voici tout le reste.

| dépôt        | branches (hors main) | en avance sur main |                     orphelines |
| ------------ | -------------------: | -----------------: | -----------------------------: |
| **gstack**   |                  308 |            **300** | 3 (histoire de mars, réécrite) |
| **InsForge** |                  552 |             **98** |                              0 |
| **pi**       |                   48 |             **40** |                              0 |
| **TOTAL**    |              **908** |            **438** |                              3 |

### La méthode, et l'erreur qu'elle a failli laisser passer

Première passe en parallèle (`xargs -P 14`) avec `2>/dev/null` : **pi rendait
23 branches sur 48**, et le silence ressemblait à un résultat. Les branches
manquantes marchaient toutes en appel direct — c'était la charge, pas la
donnée. Reprise en SÉQUENTIEL avec les échecs BRUYANTS : **48/48, zéro échec**.
gstack en perdait 3 de la même façon.

C'est exactement la classe de panne qu'A7 vise : une limite atteinte
silencieusement. Mon propre `2>/dev/null` l'a fabriquée. Le contrôle de
couverture (`comm` entre attendues et obtenues) est ce qui l'a attrapée — pas
le compte de lignes, qui semblait juste.

_Note de réconciliation_ : j'ai écrit « 376 sommets » plus haut et il y a 553
branches sur InsForge. Ce n'est pas une contradiction — **21 branches partagent
un même commit**, il y a 375 sommets DISTINCTS (376 au premier relevé, une
branche a bougé entre les deux).

### La trouvaille : `garrytan/prompt-injection-guard`

74 commits, 41 fichiers, **non fusionnée**. C'est la pièce la plus directement
utile des trois dépôts, parce qu'elle traite NOTRE I2 (« contenu tiers =
hostile ») avec une architecture que nous n'avons pas.

**Leurs six couches**, telles qu'écrites dans leur en-tête :

| couche  | quoi                                                                                       |
| ------- | ------------------------------------------------------------------------------------------ |
| L1–L3   | marquage de données, dépouillement du DOM, liste noire d'URL — **des motifs**              |
| **L4**  | classifieur ONNX local (TestSavantAI BERT-small, ~112 Mo) sur snapshots ET sorties d'outil |
| **L4b** | classifieur de transcript par **Haiku**, AVANT l'appel d'outil                             |
| **L5**  | **canari** — on injecte un marqueur et on vérifie s'il ressort                             |
| L6      | agrégation par seuils (`combineVerdict`)                                                   |

**Trois choses à retenir, et la deuxième est la plus fine :**

1. **Leurs seuils portent leur reçu** : `BLOCK 0.85 · WARN 0.60 · LOG_ONLY 0.40`,
   « calibrés contre BrowseSafe-Bench (200 cas) + corpus bénin (50 pages) ».
   C'est notre A2 appliqué par quelqu'un d'autre.

2. **Le classifieur de transcript est VOLONTAIREMENT aveugle** aux résultats
   d'outil et à la chaîne de pensée du modèle — « les attaques d'auto-persuasion
   fuient par ces canaux-là ». Autrement dit : donner PLUS de contexte au garde
   l'affaiblit. Ce n'est pas intuitif, et ça se teste.

3. **Le blocage ATTEND une décision humaine** au lieu de tuer — « wait-for-decision
   instead of hard-kill », avec une bannière Allow/Block et un
   `POST /security-decision`. Leur repli quand le modèle ne charge pas est
   déclaré : `degraded` → verdict `safe`, donc **fail-open**, signalé par l'icône.

**Leur effort de test** : 13 fichiers, ~2 800 lignes — adversarial, e2e,
Playwright réel, contrats de source, bench.

**Notre état, mesuré** : `gardeDeSortieDOutil.ts` 101 l. + `MotifsDeMenace.ts`
337 l. + `SortieDOutil.ts` 264 l. = **702 lignes de MOTIFS**, 1 366 lignes de
tests. Zéro couche modèle, zéro canari, zéro agrégation par seuils — vérifié
par recherche, pas supposé. Nous sommes à leur L1–L3.

### Ce que les branches de pi disent de leur feuille de route

Les 40 branches non fusionnées montrent où ils vont — et deux surprises :

- **ils construisent des approbations** (`approvals` 12 c., `better-approvals`,
  « project trust approvals ») alors que leur page d'accueil vend l'absence de
  popup de permission. La position minimaliste bouge ;
- **ils construisent un serveur** (`feat/coding-agent-server-backend`,
  `feat/unix-socket-cli`, `feat/coding-agent-remote-client-controller`) — donc
  ils convergent vers l'architecture que Raptor a déjà.

Trois correctifs d'API valent une lecture, parce qu'ils décrivent des cas
réels vécus en production :

- `fix/handle-empty-usage-anthropic-message-delta` — un `message_delta` peut
  arriver **sans objet `usage` du tout**, et pas seulement avec des champs
  nuls. Ils notent aussi que les jetons de raisonnement vivent dans
  `output_tokens_details.thinking_tokens`, **absent du type Usage du SDK
  0.91.1**, « vérifié contre l'API live » ;
- `fix-issue-7253` — préserver les événements d'agent pendant la compaction ;
- `fix-issue-7150` — refuser les prompts pendant une compaction manuelle.

Nous passons par le SDK, donc une partie ne nous concerne pas. Mais la
compaction manuelle et les événements perdus sont des chemins que nous avons.

### gstack : où va l'effort

284 des 300 branches sont sous `garrytan/`. Les plus grosses disent l'axe :
`gstack-as-browser` (77 c.), `prompt-injection-guard` (74), `community-mode`
(68), `team-supabase-store` (64), `browser-improvements` (64),
`chrome-extension-ctrl` (58), `browserharness` (58). **Le navigateur est leur
chantier central**, très au-delà de nos outils `preview_*`.

### InsForge : rien de neuf

98 branches, toutes du backend — `compute` (69 c.), OAuth PKCE, `refresh-token`,
`multi-admin`, Resend, `custom-rate-limits`. Le verdict de la section 2 tient :
autre catégorie. Une seule ligne effleure notre S3 (rate-limit par userId EN
PLUS de l'IP) : leur `custom-rate-limits`, 11 commits.

---

## Le triage, en une page

**Ce qui ne se prend pas, et pourquoi** — refuser est le plus gros gain :

- **tout InsForge** : un backend qu'on ne vend pas. Problème qu'on n'a pas.
- **les forks** : 0 sur 1 195 apportent une ligne. Mesuré, clos.
- **le minimalisme de pi** : pas de MCP, pas de sous-agents, pas de permissions.
  L'adopter serait démonter Raptor.
- **la couche modèles de pi** (55 347 l.) : on a comptes Max + rotation, qui est
  notre économie. Sauf la génération d'images, voir ci-dessous.

**Ce qui mérite une instruction, par ordre d'évidence :**

0. **Défense anti-injection en couches** (gstack, branche non fusionnée). La
   plus importante, et de loin : notre I2 est une LOI et son application tient
   en 702 lignes de motifs. Eux ont un classifieur, un canari, des seuils
   calibrés et une décision humaine. À instruire en premier.
1. **Surcouches de prompt par modèle** (gstack). On route déjà 5 fournisseurs
   avec un seul jeu d'instructions. Peu de code, effet immédiat.
2. **Gabarits de prompt versionnés** (pi). Notre propre I3 l'exige et on ne le
   fait pas — c'est une dette nommée par notre loi.
3. **Génération d'images** (pi, `images-api-registry`). Le garde de dépense est
   déjà écrit (n°69) ; il manque un fournisseur, qui est justement l'activation
   en attente.
4. **Arbre de session étiqueté** (pi). On a le rembobinage, pas la lecture en
   arbre. À peser : est-ce un vrai manque, ou une pièce en plus ?
5. **Import de cookies pour le navigateur** (gstack). Débloque les pages
   authentifiées en reproduction de bug.
6. **Extensions tierces exécutables** (pi). Le plus gros morceau, et le plus
   discutable : ça ouvre une surface d'exécution de code tiers. À ne pas
   commencer sans une décision explicite.

**Rien de tout ça n'est commencé.** Ce document est un inventaire, pas un
chantier — et aucune de ces six lignes n'a encore été confrontée à la question
« quel problème RÉEL et ACTUEL ça résout ? ».
