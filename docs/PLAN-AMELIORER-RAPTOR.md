# Plan — ce qui peut améliorer Raptor

Issu de la seconde passe sur `earendil-works/pi`, `garrytan/gstack`,
`InsForge/InsForge` : cette fois les dépôts sont clonés **en entier**
(historique complet, toutes les branches en local) et les diffs sont **calculés
localement**, pas devinés depuis un sujet de commit.

## Ce qui a été couvert, et le contrôle qui le prouve

| dépôt        | branches (hors main) | en avance | diffs calculés | manquantes |
| ------------ | -------------------: | --------: | -------------: | ---------: |
| **gstack**   |                  308 |       303 |            303 |      **0** |
| **InsForge** |                  552 |        98 |             98 |      **0** |
| **pi**       |                   48 |        40 |             40 |      **0** |
| **TOTAL**    |                  908 |   **441** |        **441** |      **0** |

Couverture vérifiée nom à nom (`comm` entre attendues et obtenues), pas au
compte de lignes. Deux pièges rencontrés et corrigés en route, notés ici parce
qu'ils fausseraient toute reprise :

- `cut -d"¤"` **échoue silencieusement** sur un délimiteur multi-octets et rend
  un fichier vide — ce qui faisait passer 303 branches pour « manquantes » ;
- le premier passage en parallèle avec `2>/dev/null` **perdait 25 branches sur
  pi** sans le dire. Séquentiel + échecs bruyants : 48/48.

## La carte thématique de gstack — 303 branches classées

Le classement par nom de branche, compté, pas estimé :

| thème                              | branches |
| ---------------------------------- | -------: |
| revue (ceo / eng / design / devex) |   **35** |
| codex & autres modèles             |   **26** |
| navigateur                         |   **25** |
| plan / autoplan                    |       18 |
| apprentissage & télémétrie         |       17 |
| **sécurité / injection / PII**     |   **14** |
| **AskUserQuestion / choix humain** |   **12** |
| réduction de jetons                |        7 |
| worktree / checkpoint / reprise    |        6 |

Deux nombres sautent aux yeux : **12 branches rien que sur AskUserQuestion**, et
14 sur la sécurité. Ce sont leurs deux points de douleur — et ce sont exactement
les deux endroits où Raptor est le plus exposé.

---

# LE PLAN, par ordre de priorité

Chaque ligne porte : la PREUVE (mesurée chez eux), NOTRE ÉTAT (vérifié dans
notre code, jamais déduit), l'ÉCART, le TRAVAIL, la TAILLE, le RISQUE, et le
TEST qui dira que c'est fini.

---

## R1 · Défense anti-injection en couches — **le plus urgent**

**Preuve.** `garrytan/prompt-injection-guard`, 74 commits, **41 fichiers,
6 591 insertions**, non fusionnée. Six couches déclarées dans leur en-tête :

| couche  | quoi                                                        |
| ------- | ----------------------------------------------------------- |
| L1–L3   | marquage de données, dépouillement DOM, liste noire d'URL   |
| **L4**  | classifieur ONNX local (TestSavantAI BERT-small, ~112 Mo)   |
| **L4b** | classifieur de transcript par Haiku, AVANT l'appel d'outil  |
| **L5**  | canari — on injecte un marqueur, on vérifie s'il ressort    |
| L6      | agrégation par seuils (`BLOCK 0.85 · WARN 0.60 · LOG 0.40`) |

Leurs seuils portent leur reçu : « calibrés contre BrowseSafe-Bench (200 cas) +
corpus bénin (50 pages) ». 13 fichiers de test, ~2 800 lignes.

**Notre état, mesuré.** `gardeDeSortieDOutil.ts` 101 l. + `MotifsDeMenace.ts`
337 l. + `SortieDOutil.ts` 264 l. = **702 lignes de motifs**, 1 366 lignes de
tests. Aucune couche modèle, aucun canari, aucune agrégation — recherche faite,
zéro correspondance sur `classif|onnx|canary`.

**L'écart.** Notre I2 (« contenu tiers = hostile ») est une LOI appliquée par
des expressions régulières. Un texte hostile qui n'utilise aucun de nos motifs
passe entier.

**Le travail, dans l'ordre — et l'ordre est le produit :**

1. **Le canari d'abord** (L5). C'est la couche la moins chère, sans modèle,
   sans latence par appel : on injecte un marqueur unique dans le contexte, on
   vérifie s'il ressort dans une sortie d'outil ou une requête. Un canari qui
   fuit est une preuve, pas une heuristique. **Commencer par là**, parce que
   c'est la seule couche qui donne un signal SANS faux positif.
2. **L'agrégation par seuils** (L6), avec nos motifs existants comme premier
   signal. Rendre `garderLaSortie` capable de composer plusieurs signaux au
   lieu de décider seul.
3. **Le classifieur de transcript** (L4b) — et reprendre leur trouvaille la
   plus fine : il est **volontairement aveugle** aux résultats d'outil et à la
   chaîne de pensée, « les attaques d'auto-persuasion fuient par ces canaux ».
   Donner plus de contexte au garde l'AFFAIBLIT.
4. **Le classifieur ONNX local** (L4) — 112 Mo à télécharger, en dernier.

**Taille.** 1 : ~200 l. + tests · 2 : ~150 l. · 3 : un appel Haiku par tour,
donc un coût récurrent à border · 4 : chantier à part entière.
**Risque.** Faux positifs qui bloquent du travail sain. Mitigation : nos
fil-pièges — la limite se pose AU-DELÀ de là où passe le sain, mesuré d'abord.
**Test de fin.** Un corpus d'attaques rejouable, un corpus bénin, et un chiffre
de faux positifs qui devient un golden. Pas de seuil sans son reçu (A2).

---

## R2 · La confiance de projet — **le trou possible, à instruire d'abord**

**Preuve.** `pi/approvals`, 12 commits, 21 fichiers, 849 insertions, avec
`trust-manager.test.ts` et `migrations-trust.test.ts`. Dans leur code :

> `throw new Error("Project .pi is not trusted; refusing to write project settings")`

et `setProjectConfigTrusted(trusted)`. Plus `better-approvals` (« improve
project trust approvals »). Leur page vend « pas de popup de permission » — et
ils construisent quand même un modèle de confiance. C'est un aveu.

**Notre état, vérifié.** Aucune notion de projet de confiance dans Raptor :
recherche `trusted|isTrusted|trustProject|untrusted` → uniquement des
commentaires sans rapport et un `approvalPolicy:"untrusted"` côté Codex. Or
`ClaudeSkills.ts` charge `<cwd>/.claude/skills` **en portée projet**, et le CLI
lit `.claude/settings.json` avec ses hooks.

**Ce qui n'est PAS prouvé, et il faut le dire.** Le CLI porte
`hasTrustDialogAccepted` et `hasCompletedProjectOnboarding` — donc une garde
existe chez lui. Je n'ai **pas** établi que Raptor la court-circuite. Raptor
passe un `permissionMode` et sait passer `bypassPermissions`.

**Le travail — instruction AVANT construction (M8).**

1. Ouvrir dans Raptor un dépôt jetable contenant un `.claude/settings.json`
   avec un hook inoffensif mais observable (écrire un fichier témoin).
2. Regarder si le hook s'exécute, et si une confiance a été demandée.
3. **Si oui** → rien à construire, écrire le reçu et clore.
   **Si non** → c'est un trou, et il passe en R1bis.

**Taille.** L'instruction : une heure. La suite dépend du verdict.
**Risque de ne rien faire.** Un dépôt cloné exécute du code à l'ouverture.
C'est la classe de panne la plus coûteuse : silencieuse, et pas la nôtre.

---

## R3 · AskUserQuestion — 12 branches chez eux, notre M2 non mécanisé

**Preuve.** Leur grappe, mesurée :

| branche                             |  c. | ce qu'elle apporte                                                             |
| ----------------------------------- | --: | ------------------------------------------------------------------------------ |
| `PRIORITY-broken-ask-user-question` |   8 | 5 500 insertions ; « plan reviews walk you through each issue with Pros/Cons » |
| `askuser-one-at-a-time`             |  13 | ne pas grouper les questions                                                   |
| `askuserquestion-split-on-overflow` |   6 | **« Handling 5+ options — split, never drop »**                                |
| `auq-recommendation-judge`          |  13 | **« require synthesis Recommendation »** + juge anti-hedging                   |
| `auq-failure-fallback`              |  11 | que faire quand l'outil échoue                                                 |
| `auq-auto-mode`                     |  10 | repli sur la variante MCP quand le natif est interdit                          |

Détail qui vaut le voyage : ils **testent que la recommandation ne tergiverse
pas** — « pin every hedging-regex alternate with a fixture ».

**Notre état.** M2 dit « avec UNE reco, jamais un menu ». C'est une règle de
texte. Rien ne la vérifie. Notre skill `panel` produit une synthèse ; rien ne
garantit qu'elle tranche.

**Le travail.**

1. **Un contrôle « il y a une reco »** sur toute sortie de panel/question :
   une réponse sans recommandation nommée échoue. Mécanisable, donc obligatoire
   (la règle texte est interdite si un hook est possible).
2. **Le juge anti-hedging** : une liste de tournures qui annulent une reco
   (« ça dépend », « les deux se défendent », « à toi de voir »), avec une
   fixture par tournure. Leur méthode, reprise telle quelle.
3. **La règle 5+ options** : découper en deux questions plutôt qu'en abandonner.
4. **Le repli** : que se passe-t-il si la question n'aboutit pas ? Aujourd'hui,
   non défini.

**Taille.** 1+2 : ~250 l. + fixtures. 3+4 : ~150 l.
**Test de fin.** Une sortie de panel sans reco fait rougir la suite.

---

## R4 · Les skills en squelette + sections à la demande — **le gain le mieux chiffré**

**Preuve.** `garrytan/cut-skill-token-bloat` :
**« carve /ship into skeleton + on-demand sections (−59 % always-loaded) »**,
plus `slim-skill-tokens`, `token-usage-reduction`, `slim-gstack-skills`. Ils
ont même dû réparer la CI « carve-blind » — signe que le découpage est réel et
qu'il mord.

**Notre reçu, déjà mesuré le 01/08** (chantier n°4, outil `normes-skills`) :
sur les 18 skills réelles de Palenza, **15 dépassent 240 caractères** de
description, jusqu'à 895, pour **~8 400 caractères chargés à chaque session**.

**L'écart.** Nous avons le CONSTAT et le contrôle qui le produit. Nous n'avons
pas le REMÈDE. Eux ont le remède, chiffré.

**Le travail.** Porter la forme « squelette + sections » : une skill déclare un
corps minimal toujours chargé et des sections chargées à la demande. Puis
remesurer les 8 400 caractères, et poser le nouveau chiffre comme reçu.

**Taille.** Moyenne — touche le format des skills, donc les 18 fichiers.
**Test de fin.** Le même outil `normes-skills` rend un chiffre PLUS BAS, et le
delta est le reçu. C'est la ligne la plus facile à prouver de tout ce plan.

---

## R5 · Surcouches de prompt par modèle

**Preuve.** `gstack/model-overlays/` : `claude.md`, `gemini.md`, `gpt.md`,
`gpt-5.4.md`, `o-series.md`, `opus-4-7.md`. Leur `claude.md`, cité :

> « Todo-list discipline… mark each task complete individually… Do not
> batch-complete at the end. »
> « Dedicated tools over Bash. Prefer Read, Edit, Write, Glob, Grep over shell
> equivalents. »

Plus une branche `overlay-fanout-eval` : ils **évaluent** l'effet des overlays.

**Notre état.** Absent, vérifié. Or Raptor route **cinq** fournisseurs (Claude,
Codex, Grok, Cursor, OpenCode) avec un seul jeu d'instructions.

**Le travail.** Un fichier de surcouche par famille de modèle, concaténé au
system prompt selon le fournisseur résolu. Le routage se LIT déjà dans
`modules/ai` côté Palenza et dans les adaptateurs côté Raptor — le point
d'accroche existe.

**Taille.** Petite (~100 l. + le contenu des surcouches, qui est de la
rédaction, pas du code).
**Risque.** I3 : un prompt est du code versionné. Donc ces fichiers entrent
dans la clé de cache, sinon on sert du cache périmé. **C'est la partie qu'on
rate si on va vite.**
**Test de fin.** Deux fournisseurs, deux surcouches, et une éval qui montre un
écart de comportement — sinon on a ajouté du texte pour rien.

---

## R6 · Gabarits de prompt versionnés — notre propre loi, non tenue

**Preuve.** `pi/core/prompt-templates.ts`, 285 l.
**Notre état.** Un `systemPrompt` dans `ClaudeAdapter.ts`. Pas de système.
**L'écart.** **I3 EXIGE** « prompt = code versionné ; la version entre dans la
clé de cache ». Nous ne le faisons pas. C'est la seule ligne de ce plan qui
n'est pas une amélioration mais une **dette nommée par notre propre loi**.

**Taille.** Petite à moyenne. **À faire AVEC R5** — les surcouches sont des
gabarits, les traiter séparément fabriquerait deux systèmes pour la même chose.

---

## R7 · Normaliser aux frontières d'ingestion

**Preuve.** `pi/content-hardening`, 264 insertions, 6 fichiers. Leur message de
commit dit tout :

> « The Message types require content to always be present, but untyped JS
> extension tools, hand-built histories, and old or hand-edited session files
> can violate that contract, crashing rendering, compaction, and provider
> request conversion with 'content is not iterable'. **Normalize null/missing
> content to an empty array at the ingestion boundaries instead of guarding
> every consumer.** »

Trois points d'entrée seulement : avant chaque requête fournisseur, à la
création d'un résultat d'outil, au chargement d'une entrée de session.

**Pourquoi ça nous concerne.** C'est un PRINCIPE, pas un correctif : normaliser
en un point d'étranglement plutôt que garder chaque consommateur. Raptor a les
mêmes frontières (ingestion runtime, chargement de projection, conversion vers
le fournisseur) et une session vieille ou éditée à la main est un cas réel.

**Taille.** Petite. **Test de fin.** Une session au contenu nul se charge sans
casser le rendu ni la compaction.

---

## R8 · Le verrou de session, rendu à l'écran

**Preuve.** Vidéo ICOR (voir `VEILLE-CANVAS-DE-SESSION.md`) :
« A session took this on. `40a4efa5` · **10M IDLE** » + **Where is it** ·
**Put it back**. Et chez gstack, `auto-worktree-split`,
`multi-checkpoint-resume`, `multi-host-support`.

**Notre état.** Nous avons **plus** qu'eux côté moteur : `ToursEnVol.ts`,
`AvantDeCouper.ts`, le reçu (85,2 min de tour le plus long sur 583 tours →
`FANTOME_APRES_MINUTES = 240`), et M5 en loi. Ce que nous n'avons pas, c'est
l'**écran** : rien ne dit à Enzo qu'une session tient un fil depuis 10 minutes
sans bouger.

**Le travail.** Rendre l'état que le serveur connaît déjà : qui tient quoi,
depuis quand, et un geste pour reprendre la main.
**Taille.** Petite côté serveur (les données existent), moyenne côté interface.
**Palier.** D2 — ça change un comportement visible : montrer, puis GO.

---

## R9 · Compaction — deux chemins qu'ils ont cassés avant nous

**Preuve.** `pi/fix-issue-7253` « preserve agent events during compaction » et
`pi/fix-issue-7150` « reject prompts during manual compaction ».
**Notre état.** Nous déléguons la compaction au SDK (`compactsAutomatically`),
donc une partie ne nous concerne pas. Mais **les deux chemins existent chez
nous** : des événements d'agent peuvent se perdre, et un prompt peut arriver
pendant une compaction.
**Le travail.** Instruire d'abord : rejouer les deux cas sur notre pile. Si le
SDK protège, écrire le reçu et clore. Sinon, corriger.
**Taille.** Instruction courte, correctif inconnu.

---

## R10 · Montrer du doigt : annoter une image ou une frame

**Preuve.** Vidéo ICOR : traits sur une image → « 4 STROKES ATTACHED » +
commentaire ; sur une vidéo, le trait est attaché **à l'horodatage**. Et chez
gstack, `clickable-screenshots`, `ref-screenshot-fix`, `sidebar-css-inspector`.

**Notre état.** Raptor pilote un navigateur (`preview_*`) et `debug-navigateur`
est une LOI (M12). Rien pour ANNOTER.
**Pourquoi ça vaut.** Une critique visuelle décrite en mots est ambiguë ;
entourée, elle ne l'est plus. C'est le seul geste de tout ce plan qui rend une
intention humaine non ambiguë sans l'écrire.
**Taille.** Moyenne, purement interface. **Palier D2 + D4** (preuve LIVE).

---

## Le reste, classé mais pas détaillé

| #   | quoi                                       | source                          | pourquoi plus bas                                             |
| --- | ------------------------------------------ | ------------------------------- | ------------------------------------------------------------- |
| R11 | replier les groupes d'appels d'outil       | `pi/compact-groups` (234 l.)    | confort de lecture, pas de risque évité                       |
| R12 | piste d'audit incluant l'HUMAIN            | vidéo ICOR                      | utile, mais demande de tracer les éditions d'Enzo             |
| R13 | `message_delta` sans objet `usage`         | `pi`                            | on passe par le SDK ; à vérifier avant de coder               |
| R14 | arbre de session étiqueté                  | `pi/session-manager` (1 712 l.) | on a le rembobinage ; est-ce un manque ou une pièce en plus ? |
| R15 | export HTML d'une session                  | `pi/export-html` (316 l.)       | vrai manque, faible enjeu                                     |
| R16 | import de cookies pour pages authentifiées | `gstack/browse`                 | débloque la repro de bugs derrière un login                   |

---

# CE QU'ON REFUSE — et c'est le plus gros gain

La règle suprême demande « quel problème RÉEL et ACTUEL ça résout ? ». Voici
les réponses négatives, chacune avec sa raison :

| refusé                                  | pourquoi                                                              |
| --------------------------------------- | --------------------------------------------------------------------- |
| **tout InsForge** (184 823 l.)          | un backend qu'on ne vend pas. 9 813 l. rien qu'en paiements           |
| **les 1 195 forks**                     | 0 commit inconnu, mesuré deux fois. Chantier retiré                   |
| **le minimalisme de pi**                | l'adopter serait démonter Raptor                                      |
| **la couche modèles de pi** (55 347 l.) | on a comptes Max + rotation, c'est notre économie                     |
| **le protocole CBOR distant**           | notre relais mobile sert déjà ce besoin                               |
| **le tableau de bord de la vidéo**      | Raptor EST déjà l'application ; deux écrans = deux vérités            |
| **un `canvas.json` par dossier**        | H6 à l'envers : deux endroits pour le même état                       |
| **les extensions tierces exécutables**  | ouvre une surface d'exécution de code tiers. Pas sans décision d'Enzo |

---

# L'ORDRE, si on ne fait que trois choses

1. **R2** — instruire la confiance de projet. Une heure, et ça peut révéler un
   trou d'exécution de code. C'est le seul point où ne rien faire coûte
   potentiellement cher.
2. **R4** — le squelette de skills. Le gain le mieux chiffré des deux côtés :
   ils annoncent −59 %, nous avons déjà notre 8 400 caractères de départ.
3. **R1 étape 1** — le canari. La couche de sécurité la moins chère, sans
   modèle, sans latence, et la seule qui donne un signal sans faux positif.

**Rien n'est commencé.** Ce document est un plan, pas un chantier — et chaque
ligne devra affronter la règle suprême une seconde fois au moment de
l'ouvrir.
