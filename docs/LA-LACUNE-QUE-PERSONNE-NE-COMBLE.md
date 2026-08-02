# La lacune que personne ne comble — et pourquoi elle nous appartient

Ce document est la prise de hauteur qui manquait. Les six précédents disent ce
que les autres ONT. Celui-ci dit ce que **personne n'a**, mesuré, et ce que
Raptor pourrait être si on le construisait.

## La sonde, et son honnêteté

Premier passage : motifs mêlant français et anglais. **Biaisé par
construction** — Palenza est écrit en français, il sortait 2 472 sur « reçu ».
Ce chiffre ne prouvait rien.

Second passage, **anglais seul**, Palenza retiré, avec un témoin :

| capacité                         |  pi | gstack | InsForge | superpowers | **Raptor** |
| -------------------------------- | --: | -----: | -------: | ----------: | ---------: |
| stop-the-line sur récidive       |   0 |      0 |        0 |           0 |      **0** |
| décision → résultat → leçon      |   0 |      0 |        0 |           0 |      **0** |
| auto-audit de ses propres règles |   0 |      0 |        0 |           0 |      **0** |
| registre de classes d'erreur     |   0 |      4 |        1 |           0 |          5 |
| 2ᵉ occurrence = priorité         |   2 |      4 |        0 |           0 |          7 |
| _(témoin)_ le mot « test »       | 401 |    813 |      330 |         113 |      1 004 |

Le témoin sort partout : la recherche fonctionne, les zéros sont des mesures.

**Réserve à garder** : une absence de motif n'est pas une preuve d'absence de
concept — quelqu'un peut l'avoir écrit sous un autre nom. Mais zéro sur trois
formulations distinctes, dans cinq bases, avec témoin qui répond : c'est fort.

## Ce que ça dit, et c'est le cœur

**Tout le monde optimise la passe AVANT.** Meilleurs prompts, meilleures
skills, meilleurs modèles, meilleure interface, meilleur navigateur, meilleur
suivi de coût. Six dépôts, 24 574 fichiers, ~1,2 M de lignes : c'est tout la
même direction.

**Personne n'optimise la passe ARRIÈRE** — apprendre de ce qui a raté pour que
ça ne puisse plus recommencer.

C'est exactement ce qu'Enzo décrit après avoir utilisé Claude Code, Cursor,
Hermès, ZAI, OpenRouter, Sakana, Fugu : « **il y a des lacunes un peu
partout** ». Les lacunes persistent parce qu'aucun outil n'apprend
structurellement de ses propres pannes. Chaque session repart neuve. Chaque
erreur se refait.

## Ce qu'on a déjà, éparpillé, sans l'avoir vu

Et c'est le point : **les pièces existent, personne ne les a assemblées, nous
compris.**

| pièce                                    | état                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| la matière première                      | **219 échecs d'outil · 14 refus · 346 avertissements** dans la projection                                               |
| la récidive DÉJÀ comptée                 | le garde Palenza : `G1×574 · G3×38 · PASS-GARDE_OK×56`                                                                  |
| « ce changement a-t-il amélioré ? »      | `GrapheDApprentissage.ts` (275 l., livré cette nuit)                                                                    |
| « ces refus répétés suggèrent quoi ? »   | `SuggestionsDAutorisation.ts` (325 l., livré cette nuit)                                                                |
| une règle transformée en garde mécanique | `modulesMuets.chaine.test.ts` (208 l., m'a attrapé 3 fois)                                                              |
| la doctrine écrite                       | Palenza : stop-the-line, registre des refus, « 2 occurrences = bug prioritaire », « mécanisable → hook DANS LA FOULÉE » |

J'ai livré trois morceaux de cette boucle cette nuit **sans voir qu'ils étaient
la même chose**. C'est ça, la cartographie qui manquait.

## Ce que Raptor serait

**Le premier harnais d'agent qui garde la mémoire de ses propres pannes et se
durcit contre leur récidive.**

Quatre mouvements, chacun mesurable :

1. **Typer l'échec.** Tout ce qui rate — test rouge, garde déclenché, outil
   refusé, rollback, avertissement runtime — devient un événement de CLASSE,
   pas une ligne de log. La matière est déjà dans la projection.
2. **Dériver les classes, ne pas les déclarer.** Regrouper par forme. Une
   classe qui mord deux fois est un signal ; une qui mord une fois est un
   accident. _(Le seuil existe déjà : « 3 occasions sur 2 jours distincts »
   dans `SuggestionsDAutorisation`, et son reçu — 12 des 13 vrais refus sont
   tombés le même après-midi.)_
3. **Proposer sa propre mécanisation.** « Cette classe a mordu deux fois ;
   voici le hook ou le test qui l'aurait attrapée. » Jamais l'appliquer seul :
   proposer. La règle texte est interdite si un hook est possible — mais le
   hook se décide.
4. **Refermer la boucle.** Après mécanisation, la classe récidive-t-elle ?
   C'est la seule preuve que le durcissement a servi, et c'est exactement ce
   que `GrapheDApprentissage` sait déjà répondre — y compris « pas assez de
   preuves », qui est la bonne réponse la plupart du temps.

## L'avocat du diable — trois objections, et ce qui leur répond

**« Un système qui apprend de ses erreurs, tout le monde le promet et personne
ne le livre. »** Vrai, et c'est le piège. Ce qui change ici : on ne compte que
ce qui est **MESURÉ** — un test rouge, un garde déclenché, un refus
enregistré. Jamais une inférence sur ce qui « aurait pu » mal tourner. Les
autres échouent parce qu'ils tentent de deviner ; nous avons une projection
d'événements typés. C'est la différence entre un journal et une base.

**« Ça va produire du bruit — des propositions de durcissement que personne
n'applique. »** C'est le vrai risque, plus que l'échec technique. La parade est
déjà écrite et déjà testée : seuils avec reçu, deux jours distincts, **« la
fréquence n'est pas un consentement »**. Un système qui propose peu et juste
vaut mieux qu'un système qui propose tout.

**« Raptor a cinq jours. C'est prématuré. »** L'objection la plus sérieuse, et
`AGENTS.md` la porte : _« fight scope creep », « yagni »_. La réponse tient à
la distinction déjà posée : **YAGNI vise l'invention, pas l'absorption** — et
ici on n'invente ni n'absorbe, on ASSEMBLE des pièces qu'on a déjà écrites,
sur une matière qu'on a déjà (219 échecs, 346 avertissements). Le coût
d'assemblage est faible ; le coût de ne pas le faire, c'est de refaire chaque
erreur.

## Pourquoi c'est notre moat, et pas le leur

gstack peut copier notre canari. pi peut copier notre registre de coût.
N'importe qui peut copier une skill.

**Personne ne peut copier notre historique de pannes.** Il est à nous, il
grossit à chaque session, et il décrit la forme exacte de nos erreurs — pas
celles d'un autre. Un outil qui se durcit sur SES pannes diverge de tous les
autres, un peu plus chaque jour.

C'est la seule chose de toute la veille qui ne se rattrape pas en clonant un
dépôt.

## Ce que ce document n'est PAS

Il ne dit pas de commencer demain. Il dit qu'après avoir lu 24 574 fichiers,
908 branches et six dépôts, **la meilleure idée n'était chez personne** — elle
était dans nos propres morceaux, non assemblés.

Le reste du plan (rattraper l'amont, le registre de coût, la discipline React
Scan) reste vrai et reste devant, parce que ce sont des dettes et des preuves.
Ceci est autre chose : c'est la direction.
