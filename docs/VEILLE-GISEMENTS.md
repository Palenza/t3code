# Gisements — l'aspirateur, et ce qu'il a sorti au premier forage

`scripts/veille/gisements.sh` — un outil, pas une analyse. Il cherche
l'INVERSE du dépôt viral : forte substance, faible attention. Les génies que
personne ne regarde.

## Pourquoi il existe

La veille a classé une semaine à l'étoile, puis mesuré que l'étoile ne classe
pas. `obra/superpowers` a plus d'étoiles que React (264 456 contre 246 821)
avec **38 contributeurs contre 411**. Et ~6 M de fausses étoiles sont
documentées sur GitHub, l'outillage IA en tête de peloton.

Donc : **attention = étoiles · substance = travail humain récent · gisement =
substance / attention.**

## Les quatre pièges, tous découverts EN FORANT

Aucun n'était prévisible depuis le fauteuil. Chacun rendait le classement
entièrement faux.

| #   | piège                                       | ce qu'il faisait sortir en tête                                                              | correctif                                                         |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | **les forks héritent du parent**            | `Bl4ckBl1zZ/t3code`, 212 contributeurs, 0 étoile — **un fork de notre propre amont**         | `fork:false` + revérification par dépôt                           |
| 2   | **les bots font des PR**                    | `cbrenner04/jarvis`, **2 422 PR pour 1 contributeur** — du Dependabot sur un dépôt personnel | on ne compte que les auteurs dont le nom ne finit pas par `[bot]` |
| 3   | **la fenêtre de toute une vie**             | récompense l'ancienneté, pas le travail actuel                                               | commits des **90 derniers jours**                                 |
| 4   | **`sort=stars` dans une fenêtre plafonnée** | rend le PLAFOND (800-2 000 ★), jamais le plancher                                            | _connu, non corrigé_ — il faut balayer par BANDES d'étoiles       |

Le piège 4 est le seul encore ouvert, et il est nommé plutôt qu'enterré : en
l'état l'outil trouve des dépôts **peu connus**, pas encore des dépôts
**inconnus**. Pour atteindre la couche 0-100 étoiles, il faudra forer bande par
bande.

## Ce que le premier forage propre a sorti

Requête : agents de code en TypeScript, poussés depuis le 01/06, sous 8 000 ★.
100 candidats, **0 échec de mesure**.

|     ★ | dépôt                                            | ce que c'est                                                                                                                                                    |
| ----: | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   859 | **`hoangsonww/Claude-Code-Agent-Monitor`** (MIT) | tableau de bord temps réel pour **Claude Code** : sessions, activité d'agent, usage d'outils, **orchestration de sous-agents**, analytique live, tableau kanban |
| 1 343 | **`preset-io/agor`**                             | « team command center for all things agentic »                                                                                                                  |
| 1 126 | `context-labs/HALO`                              | « Hierarchal Agent Loop Optimizer »                                                                                                                             |
| 1 056 | `langchain-ai/langchain-skills`                  | les skills vues par LangChain — **sans licence déclarée**                                                                                                       |
|   996 | `synthetic-lab/octofriend` (MIT)                 | un assistant de code open source                                                                                                                                |

**Le premier est la preuve que l'outil sert.** `Claude-Code-Agent-Monitor` fait
exactement ce que la veille avait classé EXCEPTIONNEL chez notre amont
(`subagent-obs`, `local-usage-analytics`) — et il est en MIT, à 859 étoiles,
cité par personne : ni Reddit, ni les 66 abonnements de Theo, ni la liste curée
de 128 dépôts.

**Aucun de ces cinq n'est instruit.** Les sortir n'est pas les valider.

## Comment s'en servir

```bash
./scripts/veille/gisements.sh "<requête GitHub>" [plafond-étoiles] [sortie.tsv]

# la couche peu connue
./scripts/veille/gisements.sh "topic:ai-agent language:typescript pushed:>2026-06-01" 8000

# la couche inconnue — c'est là qu'est le vrai gisement (piège 4 : forer par bandes)
./scripts/veille/gisements.sh "coding agent in:name,description pushed:>2026-06-01" 200
```

## La règle de la maison, et ce qui change

`AGENTS.md` de Raptor dit « **Channel both measure twice, cut once and yagni.
Fight scope creep.** » Ça n'interdit pas d'absorber, et la distinction porte
tout le reste :

> **YAGNI vise l'INVENTION, pas l'ABSORPTION.**
> Bâtir une abstraction pour un cas imaginé = spéculation, YAGNI mord.
> Reprendre un mécanisme que quelqu'un a déjà payé pour prouver — un canari
> calibré sur 200 cas d'attaque, un registre de coût déjà testé — ce n'est pas
> un problème qu'on n'a pas : c'est **une solution déjà amortie**.

Le test n'est donc pas « a-t-on le problème aujourd'hui ? » mais **« est-ce un
mode de panne connu des systèmes de notre forme, et quelqu'un a-t-il déjà payé
pour le résoudre ? »**

Conséquence directe sur les verdicts déjà rendus :

- **R1 (anti-injection) est re-promu.** Je l'avais rétrogradé sur 0,44 %
  d'exposition mesurée — un argument d'usage actuel, donc le mauvais argument.
- **R4 (squelette de skills) reste mort**, et pour une raison qui survit au
  changement de cadre : ce n'est pas prématuré, c'est **inadéquat**. Leur pire
  skill fait 97 900 o ; nos dix-huit réunies font 96 907 o. Mauvais outil, pas
  outil trop tôt.
