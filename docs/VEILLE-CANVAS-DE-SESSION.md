# Veille — « Claude finished the work. Then I lost it in the chat. »

Source : <https://www.youtube.com/watch?v=OOL7ILbiLdU> · ICOR with Tom |
AI Productivity · 23:18 · 47 chapitres · transcription par sous-titres
(24 401 caractères) · 60 images-clés extraites et regardées.

Ce n'est pas un dépôt : c'est une **démo d'outil**. L'auteur montre un tableau
de bord local qu'il a fait construire par l'IA pour suivre le travail des
agents. La méthode d'analyse est donc l'inverse de celle des dépôts : on lit ce
qui est DIT et on REGARDE ce qui est montré, et on ne peut rien mesurer dans le
code — il n'est pas public. **Tout ce qui suit est une lecture d'écran, pas une
mesure.** Le dire, sinon c'est la mine que H4 nomme.

## Le problème qu'il pose, et pourquoi il nous concerne

Le titre est la thèse : l'IA a fini le travail, et il s'est perdu dans le chat.
Sa formulation à [0:20] :

> « … je ne veux pas rester assis dans une session pour en garder le contrôle,
> suivre ce qu'elle fait, puis relire le chat pour y retrouver les choses. »

Et à [5:12], le vrai déclencheur : **« Losing track of decisions once agents run
in parallel »**, avec plusieurs sessions ouvertes des jours durant [5:35].

C'est mot pour mot notre A6 — « l'état vit sur disque, l'écrit survit, le retenu
meurt » — et notre M5, deux chantiers deux worktrees. Il a rencontré le même
mur et y a répondu par une INTERFACE, là où nous y répondons par des RÈGLES.

## Son architecture, telle que montrée à [19:39]–[21:24]

Un dossier local par livrable, nommé `AAAA-MM-JJ-slug`, et dedans :

| pièce                                        | rôle                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `canvas.json`                                | l'état vivant — conversations passées, décisions ; mis à jour en direct         |
| `BRIEF.md`                                   | le `CLAUDE.md` du livrable : ce que ce dossier est, pour la session qui l'ouvre |
| `decisions/`                                 | les décisions, en markdown lisible                                              |
| `calls/`                                     | les enregistrements d'appels vocaux                                             |
| `compare/`                                   | les comparaisons d'images                                                       |
| `attachments/` `out/` `film/` `generator/` … | le travail lui-même                                                             |

Le tableau de bord est une **petite application locale** dans un dossier
`expansions/`, qui lit le dossier de livrables et le sert dans un navigateur.
Pas de base externe, pas de service web [11:19]. Son argument
d'indépendance [22:35] : la seule chose à sauvegarder est le dossier, et
n'importe quel modèle peut le reprendre.

## Les cinq idées qui valent pour Raptor

### 1 · Le verrou de session sur une unité de travail — la plus proche de nous

Vu à l'écran, sur le livrable ouvert :

> **WORKING** — « A session took this on. `40a4efa5` · **10M IDLE** · CHECKED
> JUST NOW » — avec deux boutons : **Where is it** · **Put it back**

Une session RÉCLAME un livrable, l'inactivité est affichée, et l'humain peut
demander où elle est ou la libérer. C'est exactement le problème que
`ToursEnVol.ts` et `AvantDeCouper.ts` traitent chez nous — sauf que chez nous
c'est une décision INTERNE (couper ou non une mise à jour), et chez lui c'est
une information RENDUE, avec une reprise de contrôle.

Notre reçu sur ce terrain : 85,2 min de tour le plus long sur 583 tours, d'où
`FANTOME_APRES_MINUTES = 240`. Nous avons la mesure ; il a l'écran.

### 2 · La décision comme objet adressable, et trois sorties seulement

Une carte de décision, telle que lue :

> `C1X` **OPEN** — « A foreign session wrote an unverified draft into three
> files ». Corps : « A session that is not this one wrote an unverified
> four-sentence draft into `script.md`, the HTML and `canvas.json` while Scribe
> worked. He removed it from all three. **If that session is still live it will
> re-inject.** »
> Recommandation : _find and stop the other session before writing to this
> folder again._

Trois détails de conception, et le deuxième est le meilleur :

- **chaque décision porte un code court** (`C1X`) — donc elle s'appelle, se
  cite, se retrouve ;
- **le bouton AGREE répète la recommandation MOT POUR MOT.** On n'approuve pas
  « oui », on approuve _une action nommée_. Un « d'accord » sur un texte
  ailleurs à l'écran est ambigu ; celui-là ne l'est pas ;
- **trois sorties, et rien d'autre** : Go · No-go · Later. Sa formule, dans la
  vidéo animée qu'il fait produire [16:14] : _« There are only three ways out of
  my inbox, and nothing leaves without a decision. »_

Il y a aussi un `Decide all` et un `Answer all N in focus mode` — passer en revue
toutes les décisions ouvertes d'affilée. Compteur visible en permanence :
**OPEN DECISIONS 18**.

Chez nous, M1/M2 disent QUOI remonter à Enzo (argent, légal, goût, déploiement)
et « une reco, jamais un menu ». Nous n'avons pas de FORME pour ça : ça vit dans
la conversation, donc ça se perd exactement comme il le décrit.

### 3 · Le conflit entre sessions rendu comme une DÉCISION

La carte `C1X` ci-dessus n'est pas une erreur technique : c'est une décision
posée à l'humain, avec l'hypothèse explicite « si l'autre session est encore
vivante, elle va réinjecter ». Un de ses dossiers s'appelle d'ailleurs
`2026-07-31-concurrent-authoring-across-sessions`.

Notre M5 est une RÈGLE (« deux chantiers = deux worktrees ») que rien
n'applique. Lui en fait un signal. C'est la différence entre une règle texte et
un mécanisme — précisément ce que notre doctrine anti-erreur demande.

### 4 · Montrer du doigt au lieu de décrire

À [15:07] et [16:21], la partie la plus difficile à obtenir autrement :

- sur une IMAGE : on dessine des traits (4 couleurs, Undo, Clear), l'interface
  affiche **« 4 STROKES ATTACHED »**, on écrit « What needs to change? », on
  enregistre. Le commentaire porte le dessin comme contexte ;
- sur une VIDÉO : le trait est attaché **à l'horodatage**, ce qui dit au modèle
  « regarde CETTE image-là, puis lis mon commentaire » ;
- les commentaires se **résolvent**, et la prochaine session les reprend.

Raptor pilote un navigateur (`preview_*`) et a `debug-navigateur` en LOI (M12),
mais nous n'avons rien pour ANNOTER. Or M7 dit qu'on collecte les références
design sans implémenter — c'est exactement le geste qui manque pour rendre une
critique visuelle non ambiguë.

### 5 · La piste d'audit inclut l'HUMAIN

À [18:56] : il modifie lui-même le texte produit, et **sa propre modification
est tracée** — « so AI knows that I changed something ». Panneaux `TRAIL`,
`CREW`, `MEDIA`, et « WHAT THE TEAM DID · No status updates on this one yet.
**Sessions append them as they work.** »

Nous traçons ce que fait l'agent. Nous ne traçons pas ce que fait Enzo sur le
résultat — donc l'agent suivant ne peut pas savoir qu'un texte a été repris.

## Ce qu'on ne prend pas

- **Le tableau de bord lui-même.** Raptor EST déjà une application avec sa
  fenêtre, ses fils, ses checkpoints. Reconstruire un second écran qui lit un
  dossier serait une deuxième vérité pour le même état.
- **Le dossier de livrables comme source de vérité.** Notre état vit dans la
  projection SQLite et dans git. Ajouter un `canvas.json` par dossier, ce serait
  H6 à l'envers : deux endroits qui prétendent dire la même chose.
- **L'appel vocal à un agent (« Call Larry »).** On a `voice-core` et le TTS
  (n°65/66). Le manque n'est pas là.

## Ce que ça ne prouve pas

C'est une démo commerciale : il vend un « scaffold » gratuit et un abonnement
(myICOR). Rien de ce qui est montré n'est vérifiable — pas de dépôt, pas de
code, pas de mesure. Il dit lui-même [7:41] que ça lui a pris **des mois
d'itérations sans un seul build fini**, et [8:15] que c'est **encore un travail
en cours**.

Donc : les IDÉES se prennent, les résultats ne se citent pas. Et aucune de ces
cinq lignes n'a encore affronté « quel problème RÉEL et ACTUEL ça résout ? ».

## Le classement, s'il fallait n'en garder qu'une

**Le verrou de session avec inactivité affichée et reprise de contrôle.** Parce
que c'est le seul point où nous avons déjà la mesure (85,2 min sur 583 tours),
déjà le module (`ToursEnVol`, `AvantDeCouper`), déjà la LOI (M5) — et rien qui
le RENDE. Le chemin le plus court entre ce qu'on sait et ce qu'on montre.
