# La « quatrième convergence indépendante » était fausse — recheck

Enzo a demandé : _« c'est la bonne méthodologie ? »_ La réponse est non sur un
point précis, et il est central : **j'ai affirmé une convergence là où il y a
une filiation.** Testé, pas supposé.

## Ce que j'affirmais, plusieurs fois et en commit

> « Quatrième convergence indépendante confirmée : superpowers, gstack, Hermès
> ET nos agents Palenza ont tous `systematic-debugging` + `TDD` +
> `code-review` + `plan/spec` comme cœur. »

Répété dans `RECHERCHE-CLOSE.md`, `COMPARAISON-QUATRE.md`, et dans mes
réponses. La conclusion qui en découlait — _« quatre convergences = ce sont les
formes justes »_ — servait de socle à tout le triage.

## Le test, et ce qu'il rend

**Test 1 — les sources se citent-elles ?**

```
~/.hermes/hermes-agent/skills/software-development/systematic-debugging/SKILL.md
  author: Hermes Agent (adapted from obra/superpowers)
```

Et à l'identique pour `test-driven-development`, `requesting-code-review`, et
`plan` (« writing-craft adapted from obra/superpowers »).

**Les quatre skills exactes sur lesquelles je fondais la convergence sont
DÉCLARÉES comme adaptées de superpowers.** Ce n'est pas une convergence, c'est
une dérivation, écrite noir sur blanc dans le frontmatter. Je ne l'avais pas
lu.

gstack, lui, ne cite superpowers nulle part (recherche sur tout le dépôt).

**Test 2 — nos skills sont-elles antérieures à notre contact avec Hermès ?**

| notre skill        | créée          | 1re mention d'Hermès chez nous |
| ------------------ | -------------- | ------------------------------ |
| `debug-navigateur` | **2026-05-30** |                                |
| `garde-honnetete`  | **2026-06-16** | 2026-06-27                     |
| `spec-avant-code`  | **2026-06-17** |                                |
| `verifier-palenza` | 2026-07-07     | (après)                        |

**Trois de nos quatre précèdent tout contact.** Elles sont indépendantes pour
de bon. La quatrième, `verifier-palenza`, est postérieure — mais son en-tête
porte son origine propre et datée : la frustration fondatrice du 07/07 (Enzo
demandant « teste tout » six fois dans une session). Origine documentée, pas
copie.

## La correction

| ce que je disais             | ce qui est vrai                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 4 convergences indépendantes | **3 lignées** : superpowers→Hermès (dérivation), gstack (indépendant), Palenza (indépendant)        |
| « les 4 confirment »         | Hermès ne CONFIRME rien — il hérite. Compter un descendant comme un témoin, c'est compter deux fois |

**Le signal reste réel mais plus faible : 3 lignées, pas 4.** Trois équipes qui
n'ont pas copié aboutissent aux mêmes quatre formes. C'est solide — ce n'était
juste pas ce que j'ai écrit.

## Pourquoi je m'y suis trompé, et ce que ça dit de la méthode

L'erreur est **exactement celle que j'ai dénoncée deux fois cette nuit** :

- pour les ÉTOILES, j'avais confondu volume et substance ;
- pour React Scan, j'avais lu 26/26 sur 23 branches comme une discipline, alors
  que c'était une campagne d'agent en cinq jours ;
- ici, j'ai lu quatre occurrences comme quatre témoignages, **sans vérifier
  qu'elles étaient indépendantes**.

Trois fois le même défaut : **compter des occurrences au lieu d'établir leur
indépendance.** C'est la faute de méthode la plus coûteuse de la veille, parce
qu'elle produit des conclusions qui SONT plausibles.

### La règle qui en sort, et elle est générale

> **Avant de traiter N sources comme une confirmation, prouver qu'elles ne
> descendent pas l'une de l'autre.** Le frontmatter, l'attribution, la date de
> création : ça coûte une commande. Sans ce test, « N sources d'accord » peut
> n'être qu'UNE source recopiée N fois.

À appliquer partout où j'écris « convergence », « confirmé par plusieurs »,
« tout le monde fait X ».

## La correction de la correction — deux trous, dont un fatal

**Trou 1 — « gstack est indépendant » reposait sur un silence.** Je l'ai conclu
d'un grep négatif. Mesuré ensuite : **3 skills sur 59 portent une attribution
quelconque.** gstack n'attribue quasiment rien — donc l'absence de citation de
superpowers ne prouve strictement rien. C'est l'erreur du silence, la septième
de la session, commise dans le document qui corrigeait les six autres.

État réel des lignées :

|             | statut                                                |
| ----------- | ----------------------------------------------------- |
| superpowers | source (ou codificateur précoce)                      |
| Hermès      | **dérivé PROUVÉ** (frontmatter)                       |
| gstack      | **INCONNU** — n'attribue rien, silence non concluant  |
| Palenza     | **indépendant PROUVÉ** (dates antérieures au contact) |

Donc : 2 lignées prouvées indépendantes, 1 inconnue, 1 dérivée. Pas 4, pas 3.

**Trou 2, et il est fatal : la question ne valait pas la peine d'être posée.**

`systematic-debugging`, `TDD`, `code-review`, `plan/spec` ne sont pas des
trouvailles — c'est le **canon du génie logiciel** : TDD (Beck, ~1999), la
revue par inspection (Fagan, 1976), l'analyse de cause racine (antérieure au
logiciel), planifier avant de bâtir (universel).

Quatre cadres d'agents qui encodent tous TDD, c'est comme quatre livres de
cuisine qui ont tous un chapitre sur le couteau. **Ça prouve que le canon est
célèbre, pas que quiconque a découvert une vérité.** Ma « convergence », dans
sa version fausse comme dans sa version corrigée, mesurait quelque chose de
trivial — et j'ai bâti un triage dessus.

### Où l'information vit réellement : les DÉSACCORDS

Là où tout le monde est d'accord, il n'y a **aucune décision à prendre**. Là où
ils divergent, il y a un choix — et c'est là qu'il fallait regarder :

| divergence                                                   | ce qu'elle tranche                   |
| ------------------------------------------------------------ | ------------------------------------ |
| superpowers : « code écrit avant le test ? **supprime-le** » | jusqu'où va la loi de fer            |
| gstack : revue au stade **PLAN**, pas au stade code          | quand la revue coûte le moins cher   |
| nous : **preuve par mutation**                               | comment savoir qu'un test mord       |
| pi : **refuse** sous-agents, MCP, permissions                | noyau minimal contre produit complet |

Ces quatre-là sont informatifs parce qu'ils s'excluent. Le tronc commun, non.

**Leçon de méthode, plus générale que la première :** chercher la convergence
est un réflexe rassurant qui produit des conclusions sans information. La
question utile est toujours **« où divergent-ils, et pourquoi ? »**.

## Ce que la correction NE change pas

Les gestes du triage tiennent, parce qu'ils ne reposaient pas sur le compte
mais sur la comparaison pièce à pièce :

- fusionner la loi de fer de superpowers avec notre preuve par mutation ;
- fusionner la revue au stade PLAN (gstack) avec notre `challenger` ;
- fusionner l'artefact de plan daté avec notre grill incorporé ;
- reconstruire nos process en skills exécutables (le seul retard franc).

Et un gain, même : **Hermès étant un dérivé, il cesse d'être une source à
part.** Ce qu'on en a absorbé de méthode remonte en réalité à superpowers —
donc lire superpowers À LA SOURCE, comme fait, était le bon geste, et il rend
inutile de re-fouiller Hermès sur ces quatre-là.

## Verdict sur la méthodologie, puisque c'était la question

Ce qui a bien tenu : mesurer au lieu de recopier (étoiles démasquées), lire le
code au lieu de déduire (cinq verdicts renversés), l'anti-silence (six pannes
muettes attrapées), la preuve par mutation.

Ce qui a cédé, trois fois : **l'indépendance des sources n'était jamais
testée.** C'est corrigé ici, et la règle est écrite pour que ça ne revienne
pas.
