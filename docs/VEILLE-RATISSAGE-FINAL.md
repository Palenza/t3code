# Ratissage final — le classement s'inverse quand on change de critère

Suite de `VEILLE-REDDIT-ET-ETOILES.md`, après avoir passé les six subreddits
sous tous les angles et miné la liste curée qu'ils citent.

## Reddit : six subs, quatre angles, UNE trouvaille

| sub              | angles passés                                           | matière d'ingénierie      |
| ---------------- | ------------------------------------------------------- | ------------------------- |
| **r/ClaudeCode** | top du mois · recherche « skill » · recherche technique | **1** (les bugs de cache) |
| r/AgentsOfAI     | top de l'année                                          | 0                         |
| r/vibecoding     | recherche multi-sub × 2                                 | 0                         |
| r/ChatGPTCoding  | recherche multi-sub × 2                                 | 0                         |
| r/SideProject    | top · recherche ciblée                                  | 1 lien (la liste curée)   |
| r/WebAfterAI     | recherche multi-sub                                     | 0                         |

Le haut de ces subs, c'est du mème et de la plainte sur les quotas :
« Dear Anthropic, This Has to STOP », « Fable Came Back Nerfed », « Opus 4.7 is
legendarily bad ». Le tri par score fait remonter le sentiment, jamais la
technique — quel que soit le mot-clé cherché.

**Deux limites de méthode rencontrées**, notées pour la prochaine fois :

- l'URL multi-sub (`/r/a+b+c/top`) rend une page **vide de 1 294 octets** ;
  Reddit la refuse silencieusement. Un sub à la fois ;
- la recherche Reddit trie par score, donc **cherche des mots techniques et
  rend quand même les posts viraux**. Il faut viser un titre connu, pas un thème.

**Ce qui a survécu au tri** — les seuls posts qui mesurent quelque chose :

| points | ce qu'il apporte                                                     |
| -----: | -------------------------------------------------------------------- |
|    999 | les deux bugs de cache (10-20× le coût) — déjà traité, issues closes |
|    997 | 71,5× de réduction de jetons par graphe de connaissance              |
|  1 924 | « Claude 67 % plus bête » — un dev a fait tourner **6 852 sessions** |
|    557 | audit de **926 sessions** sur les causes réelles des limites         |

Les deux derniers sont du même genre que notre discipline : des gens qui
mesurent au lieu d'affirmer. À lire si on veut instruire nos propres quotas.

## La liste curée : 6 upvotes sur Reddit, 128 dépôts dedans

`caramaschiHG/awesome-ai-agents-2026` — ★1 516, 46 Ko de markdown, **128 dépôts
GitHub distincts** extraits. Le post Reddit qui l'annonce a **6 points**.

C'est le renversement en petit : Google met ce post en avant, la communauté
l'a ignoré, et c'est pourtant la seule source du ratissage qui contenait de la
matière.

## LE CLASSEMENT, au bon critère

Étoiles = attention. **PR pour 1 000 étoiles = travail d'ingénierie réel.**

| dépôt                    |       ★ |     PR | **PR / 1 000 ★** |
| ------------------------ | ------: | -----: | ---------------: |
| **RooVetGit/Roo-Code**   |  24 363 |  7 697 |        **315,9** |
| **pingdotgg/t3code**     |  16 081 |  3 565 |        **221,7** |
| Codium-ai/pr-agent       |  12 321 |  1 827 |            148,3 |
| google-gemini/gemini-cli | 106 284 | 12 348 |            116,2 |
| InsForge                 |  12 606 |  1 425 |            113,0 |
| cline/cline              |  65 332 |  6 847 |            104,8 |
| smolagents               |  28 613 |  1 656 |             57,9 |
| SWE-agent                |  19 971 |    836 |             41,9 |
| browser-use              | 107 421 |  3 353 |             31,2 |
| pi                       |  81 477 |  2 523 |             31,0 |
| gstack                   | 125 525 |  1 703 |             13,6 |
| AgentBench               |   3 625 |     45 |             12,4 |
| opencode                 |  13 601 |    141 |             10,4 |
| Agent-Reach              |  63 403 |    362 |              5,7 |
| **obra/superpowers**     | 264 456 |  1 071 |          **4,0** |

**L'inversion est totale.** superpowers, premier à l'étoile (264 456), est
**dernier** au travail. Roo-Code, 24 363 étoiles — dix fois moins — est
**premier**, devant notre propre amont.

_Note d'honnêteté_ : superpowers et gstack sont des dépôts de MARKDOWN. Un
faible ratio de PR n'y est pas une anomalie, c'est la nature du contenu. Le
tableau ne dit donc pas « ceux-là trichent » — il dit **« l'étoile ne classe
pas »**, et qu'il faut un second critère selon ce qu'on cherche : de la
MÉTHODE (superpowers reste la meilleure) ou du CODE (Roo-Code, cline,
gemini-cli).

_Note technique_ : trois mesures ont d'abord échoué (l'API `search/issues` est
limitée à ~30 appels/min et rend un 422 trompeur, pas un 429). Contournées par
l'en-tête `Link` de `repos/{}/pulls?state=all&per_page=1`, qui donne le même
compte sans passer par la recherche. À réutiliser.

## Les trois dépôts que le ratissage ajoute vraiment

Aucun n'était cité sur Reddit ; ils sortent de la liste curée et du critère.

| dépôt          | pourquoi il compte pour Raptor                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Roo-Code**   | 315,9 PR/1k★, la densité la plus forte de toute la veille. Agent de code multi-mode dans l'IDE. À instruire en priorité |
| **cline**      | 104,8 · « autonomous coding agent as an SDK » — le même métier que nous, vendu comme SDK                                |
| **gemini-cli** | 116,2 sur 106 284 ★ — Google, donc un harnais CLI industriel à comparer aux nôtres                                      |

`browser-use` (31,2 · 107 421 ★) mérite un regard le jour où on instruira le
navigateur, en face du `browse` de gstack.

`opencode` (10,4) : Raptor a déjà son adaptateur. Rien à faire.

## Ce que le ratissage NE donne pas

Aucun de ces 128 dépôts ne bat les deux priorités déjà posées : **rattraper
notre amont** (16 commits, dont un sur `selfUpdate.ts` que j'ai touché cette
nuit) et **reprendre `local-usage-analytics`** (sans quoi une régression de
cache à 10-20× resterait invisible).

Le ratissage a surtout servi à corriger la MÉTHODE : j'ai classé une semaine
entière à l'étoile, et le classement s'inverse quand on mesure le travail.
