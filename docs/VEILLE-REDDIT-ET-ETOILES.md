# Veille — Reddit, et pourquoi j'ai classé à l'étoile toute la semaine

## L'accès : 3 outils sur 4 sont morts, le navigateur est passé

| voie                       | résultat                            |
| -------------------------- | ----------------------------------- |
| `WebFetch` sur reddit.com  | refusé par l'outil                  |
| `curl` + UA navigateur     | **HTTP 403**                        |
| brightdata / firecrawl     | **401 jeton expiré · 402 paiement** |
| **navigateur `preview_*`** | **passé** — c'est la seule voie     |

À noter : `WebSearch` n'honore pas l'opérateur `site:`. Une recherche
« site:reddit.com … » rend des blogs, pas Reddit. Ne pas s'y fier.

## La question qui met en cause TOUTE ma veille

Un fil de r/github demande « How do these AI repos gain SO many stars so
quickly », réponse du haut : « 100 percent bots and AI boosters ». J'ai classé
pi, gstack, superpowers, InsForge **à l'étoile**.

**Le phénomène est documenté** : ~6 millions de fausses étoiles identifiées sur
GitHub, et les dépôts d'assistants IA sont la catégorie qui flambe (121 étoiles
en 24 h après un passage sur Hacker News, 10 k en quelques jours pour certains).

### Ce que j'ai mesuré, et ce que ça vaut

Premier indicateur essayé — **étoiles par watcher** : superpowers 265,
Agent-Reach 294, t3code **350**. Notre amont est le PIRE sur cette échelle.
**L'indicateur ne discrimine rien : je l'abandonne**, plutôt que de le garder
parce qu'il m'arrangerait ailleurs.

Celui qui parle, c'est **les PR pour 1 000 étoiles** :

| dépôt                |       ★ |    PR | PR / 1 000 ★ | contributeurs |
| -------------------- | ------: | ----: | -----------: | ------------: |
| **pingdotgg/t3code** |  16 081 | 3 565 |    **221,7** |           209 |
| InsForge             |  12 606 | 1 425 |        113,0 |           105 |
| pi                   |  81 477 | 2 523 |         31,0 |           250 |
| gstack               | 125 525 | 1 703 |         13,6 |        **12** |
| Agent-Reach          |  63 403 |   362 |          5,7 |             — |
| superpowers          | 264 456 | 1 071 |      **4,0** |            38 |

superpowers a **plus d'étoiles que React** (264 k contre 247 k) avec **38
contributeurs** contre 411.

**La nuance honnête** : superpowers et gstack sont surtout du markdown. Un
dépôt de méthode n'a pas besoin de 200 contributeurs, et un ratio de PR bas n'y
prouve rien de louche. Ce que ces chiffres établissent n'est pas la fraude —
c'est que **l'étoile mesure l'attention, pas la substance**, et que je m'en
suis servi comme signal de priorité.

**Correction de méthode** : le classement se fait sur l'activité d'ingénierie
et sur la proximité au problème, jamais sur l'étoile.

## r/ClaudeCode — le haut du sub ne vaut rien, la recherche vaut de l'or

Top du mois : des mèmes et des plaintes sur les quotas (« Dear Anthropic, This
Has to STOP », « Fable Came Back Nerfed »). Une seule ligne substantielle :
**« I never thought this would happen to me (data loss) »**, 686 commentaires.

En cherchant dans le sub, la matière apparaît :

| points | sujet                                                                  |
| -----: | ---------------------------------------------------------------------- |
|    999 | **deux bugs de cache qui multiplient les coûts par 10-20×**            |
|    997 | 71,5× de réduction de jetons via un graphe de connaissance             |
|    557 | audit de **926 sessions** sur les causes réelles des limites atteintes |
|  1 967 | mode « lazy senior dev » → 6× moins de code écrit                      |
|  1 684 | le code source de Claude Code fuité sur X                              |
|    775 | la différence réelle entre Hooks / Skills / Plugins / SKILL.md         |

### LA trouvaille : les deux bugs de cache

Issue de la rétro-ingénierie du binaire (228 Mo, Ghidra + proxy MITM) :

- **Bug 1** — le binaire autonome remplace un sentinelle `cch=00000` dans le
  corps JSON, au niveau natif, après `JSON.stringify` et avant TLS. Si
  l'historique contient le sentinelle, c'est LUI qui est remplacé → préfixe de
  cache cassé à chaque requête.
- **Bug 2, celui qui nous vise** — **`--resume` casse TOUJOURS le cache depuis
  v2.1.69.** Cause : `deferred_tools_delta` — outils différés + instructions
  MCP + **liste des skills** (~13 Ko) sont injectés dans `messages[0]` en
  session fraîche, mais **ajoutés à la fin** (`messages[N]`) à la reprise. Le
  préfixe diffère → reconstruction complète du cache → 10-20× le coût.

### Notre exposition, vérifiée

`ClaudeAdapter.ts` passe `resume:` en **quatre endroits** (lignes 1515, 3652,
3741, 3795) et lance un binaire par `pathToClaudeCodeExecutable`. Raptor coche
donc les deux cases du scénario.

**MAIS — et c'est A1, on vérifie l'état au lieu de le déduire** : les deux
issues amont sont **CLOSES**, `#40524` le 04/04/2026 et `#34629` le 01/04/2026.
Quatre mois. Le bug est corrigé en amont ; l'auteur du post le dit lui-même
sans avoir pu le revérifier.

**Ce qui reste vrai, et qui est le vrai enseignement** : nous serions
**incapables de le détecter**. Nous n'enregistrons ni `cache_read` ni
`cache_creation` par tour. Un facteur 10-20× sur le coût passerait chez nous
sans un seul signal.

**Et ça donne sa vraie raison d'être au n°2 du plan v2** :
`t3code/local-usage-analytics`, la branche amont qui enregistre le coût exact
en micro-USD par tour et par modèle. Ce n'est pas « un tableau de bord
sympathique » — c'est **le seul moyen de voir une régression de cache**.

## Agent-Reach — l'outil qui résout mon mur, et l'ironie

`Panniantong/Agent-Reach` (★63 403, MIT, Python, créé le 24/02/2026) : « Give
your AI agent eyes to see the entire internet ». Leur tableau des douleurs liste
littéralement **« Reddit: Server IPs get 403'd »** — le mur exact que je viens
de heurter.

**Et c'est précisément le risque R2.** L'installation se fait en collant une URL
à son agent, qui exécute `pip install` et des commandes shell. Un outil tiers,
exécuté par l'agent, sur la machine. Le README propose d'ailleurs un mode
`--safe` « qui n'installe rien automatiquement » — l'aveu que le mode par défaut
le fait.

**Verdict : à ne pas installer sur cette machine.** Le navigateur `preview_*`
a résolu le besoin sans exécuter de code tiers.

## La distribution des skills passe par le social, pas par GitHub

Satya Nadella décrit publiquement (30/07/2026, 984 k vues) avoir construit une
application avec « un seul prompt + skill (`/drill-me`) », puis `/rubber-duck`
pour tester. Matt Pocock réagit : « soit le CEO de Microsoft utilise MA skill et
se trompe de nom, soit il utilise une skill postée par un redditor sur
r/ClaudeCode **avec 2 upvotes** ».

**Ce que ça dit pour nous** : une skill à 2 upvotes atteint le patron de
Microsoft. La valeur d'une skill ne se lit ni dans les étoiles, ni dans les
votes — ce qui rejoint exactement la méthode de superpowers : **la seule preuve
qu'une skill vaut quelque chose, c'est de regarder un agent échouer sans elle.**

## Ce qui change dans le plan

1. **Le classement à l'étoile est retiré.** Critère : activité d'ingénierie +
   proximité au problème.
2. **`local-usage-analytics` monte** — il ne s'agit plus de confort mais de la
   capacité à voir une facture qui décuple.
3. **R2 (confiance de projet) se confirme par un cas réel** : Agent-Reach, un
   outil qu'on aurait de bonnes raisons de vouloir, s'installe en faisant
   exécuter du code tiers par l'agent.
