# Nos valeurs par défaut — et pourquoi elles battent les leurs

> Un défaut est une **décision prise à la place de l'humain**. Il s'applique
> quand personne ne regarde, sur la machine de quelqu'un qui n'a pas lu ce
> fichier. C'est le réglage le plus important du produit, et le seul que
> presque personne ne change.

## Les deux règles

**RÈGLE 1 — un défaut se MESURE sur l'usage réel, jamais sur une moyenne.**

Les valeurs d'Hermès viennent d'un an d'usage de milliers de gens : c'est une
moyenne, et elle est bonne. Mais on a quelque chose qu'ils n'ont pas — la
mesure de NOTRE usage. Deux de leurs défauts nous nuiraient, et on le SAIT
parce qu'on a compté.

**RÈGLE 2 — quand toucher une limite ne coûte plus rien, la limite doit
DESCENDRE.**

C'est l'inverse du fil-piège classique, et c'est neuf. Un fil-piège se pose
au-delà du sain parce que le toucher fait mal. Mais depuis que les sorties
d'outil DÉBORDENT sur disque au lieu d'être tronquées, les toucher ne perd
rien : ça remplace une queue par un pointeur. La limite cesse alors d'être un
garde-fou et devient un **budget** — et un budget se serre.

---

## Le tableau

| réglage                       | Hermès                                          | NOUS                   | le reçu                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **plafond de sortie d'outil** | 150 000, **tronque**                            | **40 000, déborde**    | 7 329 sorties mesurées : p50=342, p90=1 969, p99=158 789, max=675 320. À 40 000 on touche **1,3 %** des sorties et on économise **83 %** du volume (30,4 M car sur 36,8 M). À 10 000 on ne gagne que 2 points de plus en embêtant 60 % de sorties en plus : **40 000 est le genou.**                            |
| **pas d'agent max**           | 120                                             | **aucun**              | Mesuré : p50=10, p90=41, p99=109, **max=198**. Leur défaut aurait COUPÉ les tours les plus lourds — dont celui qui a livré quatre chantiers. Une limite qui tranche du travail sain est une limite fausse (A2).                                                                                                 |
| **timeout d'approbation**     | 60 s                                            | **aucun**              | Mesuré : un tour dure **3 min en médiane, 14 min au p90, 45 min au p99**. Un timeout de 60 s auto-refuse pendant que l'humain est parti chercher un café — et l'agent reste planté sans savoir pourquoi.                                                                                                        |
| **mode d'approbation**        | Off                                             | **garde actif**        | Un défaut doit protéger le cas où personne ne regarde. Le leur laisse tout passer ; le nôtre a mordu 5 fois en une journée, dont 3 fois sur du vrai danger.                                                                                                                                                     |
| **caviardage des secrets**    | ON, « when possible »                           | **inconditionnel**     | « Quand c'est possible » est une porte ; la nôtre est obligatoire et son câblage est TESTÉ (`porteDeSortie.chaine.test.ts`). Le 31/07, deux outils sur six l'esquivaient — c'est le test qui l'a trouvé, pas la relecture.                                                                                      |
| **URL privées**               | 3 bascules distinctes                           | **aucune bascule**     | Privé permis (le serveur de dev est le produit), lien-local `169.254.0.0/16` refusé TOUJOURS. Une bascule mal réglée est une faille ; pas de bascule, pas de faille.                                                                                                                                            |
| **compression du contexte**   | seuil 0,6 → cible 0,2, **30 messages protégés** | _hors de notre main_   | Le SDK impose : ~100 % → 1,7 %, **3 messages**. On ne contrôle ni la cible ni les protégés. Notre vrai levier est ailleurs, et il est mesuré : **79 % de la fenêtre part en images (54 %) et en lectures de fichiers (25 %)**. Serrer le plafond de sortie vaut mieux que régler un seuil qu'on ne possède pas. |
| **sous-agents parallèles**    | 5                                               | **min(16, cœurs − 2)** | Le leur est un nombre ; le nôtre s'adapte à la machine.                                                                                                                                                                                                                                                         |
| **effort des sous-agents**    | Ultra                                           | **Ultra**              | Repris tel quel, et c'est bien vu : un sous-agent n'a qu'un tour, pas d'aller-retour pour se rattraper.                                                                                                                                                                                                         |
| **checkpoints de fichier**    | ON                                              | **ON + `rescueRef`**   | Le shadow-git de cline, qu'ils n'ont pas.                                                                                                                                                                                                                                                                       |

## Ce qu'on ne fera PAS comme eux

**Trois bascules pour les URL privées.** `Allow Private URLs`,
`Browser Private URLs`, `Local Browser For Private URLs` : trois interrupteurs
pour une seule question, donc trois façons de se tromper. Chez nous la règle
est dans le code et ne se règle pas.

**Un `Approval Mode` à Off par défaut.** Un garde qu'il faut allumer est un
garde éteint.

**Un plafond qui tronque.** H6 : rien ne se jette. Une troncature est une
contrainte d'appel LLM, jamais de stockage.

## Ce qu'on leur prend sans discuter

`Subagent Reasoning Effort: Ultra` · `In-App Update Local Changes: Stash`
(une mise à jour remise les édits locaux au lieu de les jeter) ·
`Confirm MCP Reloads` · la séparation des notifications en **six catégories**
plutôt qu'un interrupteur · et surtout leur phrase, qui est mot pour mot la
consigne du fondateur : _« les alertes de fin ne se déclenchent QUE si
l'application est en arrière-plan »_.

## Ce qui reste à mesurer

- Le seuil de déclenchement d'un `/compact` volontaire. Les trois pièces
  existent (`isAutoCompactEnabled`, le remplissage en direct, le prompt
  verbatim) mais on n'a aucune mesure de ce que gagnerait un compactage à
  60 % plutôt qu'à 100 %. **On ne pose pas ce nombre avant de l'avoir vu.**
- Le plafond des IMAGES. C'est le premier poste de dépense (54 % de la
  fenêtre, ~89 k jetons par capture) et il n'a aucune limite. C'est le plus
  gros gain restant, et de loin.
