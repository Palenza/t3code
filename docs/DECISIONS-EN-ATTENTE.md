# Décisions en attente — chantier Hermès

> **Il ne reste plus de question, il reste deux ACTIVATIONS.**
>
> Ce fichier posait quatre questions le 01/08 au soir. Trois se sont résolues
> dans la nuit — deux en allant vérifier, une en construisant. Ce qui reste
> n'est plus un arbitrage mais deux clés à fournir.

---

## 1 · Un jeton de bot Telegram

**Ce qui est déjà écrit** : les sept décisions de la passerelle, toutes
testées, toutes posées avant le premier octet réseau.

|             |                                                              |
| ----------- | ------------------------------------------------------------ |
| **n°40**    | qui a le droit de parler — défaut : refuser                  |
| **n°38**    | comment le flux tient dans le médium — repli adaptatif       |
| **n°39**    | quoi réessayer, quand renoncer — auto-guérison               |
| **n°41**    | le contrat d'adaptateur, gardé contre les cas particuliers   |
| **n°42**    | lire une mise à jour Telegram, ses huit formes               |
| **n°43**    | tenir la connexion, et voir sa mort silencieuse              |
| **n°44/45** | les commandes, et le silence quand elles visent un autre bot |

**Ce qui manque** : le jeton, et rien d'autre. Il vient de `@BotFather` sur
Telegram, et il se range en variable d'environnement (S2 : jamais commité,
jamais dans une URL).

**À savoir avant de le donner** — vérifié le 01/08, et ça peut changer ta
réponse : T3 a **déjà** un client mobile natif (`apps/mobile`) qui parle au
même serveur par un relais. L'accès à distance est donc résolu. Ce que la
passerelle ajoute, c'est répondre depuis **l'application de quelqu'un
d'autre** — Telegram plutôt que la tienne. C'est un vrai confort, pas une
capacité neuve.

- [ ] voici le jeton
- [ ] plus tard — les sept décisions attendront sans se périmer

---

## 2 · Un fournisseur d'images, et son plafond

**Ce qui est déjà écrit** : le garde de dépense (n°69). Pas de budget, pas de
dépense — un budget absent ne veut pas dire « illimité », il veut dire que
personne n'a décidé. Il refuse aussi une demande déjà servie, et il alerte à
80 % plutôt qu'au plafond.

**Ce qui manque** : quel fournisseur, et combien par période. Les deux
engagent de l'argent, donc les deux sont à toi (M2).

**Ce que le garde protège** : la panne la plus coûteuse de toutes celles
traitées cette nuit. Chaque appel réussit, chaque appel est facturé, rien ne
dépasse jusqu'au relevé.

- [ ] fournisseur : \_\_\_\_ · plafond : \_\_\_\_ par \_\_\_\_
- [ ] plus tard

---

## Ce qui ne t'attend plus

**~~Installer des skills dans ton home Claude~~** — question dissoute. Le CLI
porte un marketplace complet, `agentskills.io` compris, avec sa propre
politique de sources. T3 n'a aucune permission à demander. Ce que T3 ajoute
est l'INSPECTION avant de prendre — et c'était bien la moitié qui manquait :
un marketplace installe, il ne scanne pas contre 121 motifs de menace. Sur les
69 skills d'Hermès, le nôtre en a refusé 30 sur pièce.

**~~Le CLI expose-t-il `/goal` ?~~** — répondu en lisant le binaire. Oui, et
`/goal clear` l'arrête.

**~~Les surfaces~~** — construites dans la nuit sur ton « go pour tout » : le
mot d'éveil, le TTS, le choix d'astuce. Il ne reste que le TEXTE des astuces
et la place du bouton de lecture — du ton, pas du code.

---

## Les deux dernières lignes sont livrées

**n°3 · graphe d'apprentissage** et **n°12 · suggestions d'allowlist** ne
sont plus en attente. Je les tenais pour « bloquées par le temps » ; c'était
une confusion entre l'intérêt de la SORTIE et la constructibilité du MODULE.
Un module qui répond « pas assez de preuves, il en manque 5 » est la bonne
implémentation, pas une implémentation absente.

Les deux rendent aujourd'hui une **liste vide avec ses raisons chiffrées**,
et c'est le produit : n°12 a lu 13 refus et n'en propose aucun (10 sont des
chaînes shell dont le début ment sur la suite) ; n°3 a lu 64 mutations et n'en
juge aucune (59 skills jamais observées). Un suggéreur naïf aurait proposé
`Bash` sur 12 refus.

Au passage, deux choses que j'affirmais ici et qui étaient fausses — vérifiées
en allant lire la base plutôt qu'en raisonnant :

- la commande d'un refus était réputée irrécupérable. Elle ne l'est pas :
  **13 refus sur 13** se rattachent à leur commande, par un identifiant qui
  existait déjà.
- la clé que j'avais posée le 01/08 était réputée avoir rendu l'attente
  productive. Elle n'a jamais tourné : l'application installée date du 31/07
  à 15h54, le commit du lendemain 02h27.

Il n'y a donc plus rien à construire, et plus rien à décider. Seulement les
deux clés du haut de cette page.

---

## 3 · La dictée doit survivre à la navigation

**Le symptôme, vécu le 01/08** : Enzo dicte, ouvre les Réglages, revient — tout
ce qu'il a dit a disparu. « Quoi que je fasse, ça doit continuer. »

**La cause, trouvée** : `apps/web/src/components/chat/useVoiceDictationSession.ts`,
l'effet de nettoyage en fin de hook appelle `requestStop({ commit: false })` au
DÉMONTAGE. Les Réglages sont une route : ouvrir cette page démonte
`ChatComposer`, donc le hook, donc la capture. `commit: false` signifie que le
texte est **jeté**, pas posé.

**Ce qui est livré en attendant** : la perte n'est plus SILENCIEUSE. Un
avertissement part si — et seulement si — il y avait du texte à perdre. Une
perte annoncée se re-dicte ; une perte muette se découvre trop tard.

**Le remède, et pourquoi il n'a pas été fait**

Il faut sortir la session du composeur pour qu'elle vive au-dessus de la
navigation, comme `useSidebarPeekStore` le fait déjà pour le peek. Le chemin le
plus court repéré :

1. instancier le hook dans `AppSidebarLayout` (qui ne se démonte pas quand on
   change de route) plutôt que dans `ChatComposer` ;
2. exposer la session par un contexte ; `ChatComposer` la consomme ;
3. `onCommit` est spécifique au composeur — mais `onCommitRef` existe DÉJÀ dans
   le hook, donc le composeur monté n'a qu'à s'y ré-enregistrer.

**Ce n'est pas la taille qui bloque, c'est la VÉRIFIABILITÉ.** Aucun des 7 478
tests ne touche le microphone : une capture média ne se teste pas en CI ici. Si
ce déplacement se trompe, la dictée ne perd plus du texte — elle ne fonctionne
plus du tout. Le mode de panne du remède est PIRE que celui du bug.

**Condition pour l'ouvrir** : une session dédiée, avec Enzo disponible pour
essayer le micro après chaque étape. Pas en fin de session, pas en autonomie.

---

## 4 · Le rebond de la barre latérale — mesuré, cause NON trouvée

Enregistrement du 01/08 22:03 (120 fps, 3600×2338, 28,7 s), 3 443 images
extraites. Deux mesures tiennent, une hypothèse est morte, la cause reste
ouverte.

**Ce qui est MESURÉ (solide, aucun seuil deviné)**

Bord de la zone colorée de la barre, critère de SATURATION, à deux instants
calmes hors animation, sur trois lignes concordantes (y = 120, 150, 180) :

    avant  9,20 s ....... 87   (échelle 360 px)
    après 10,40 s ....... 85
    → ~20 px de rétrécissement en résolution réelle

Centroïde horizontal du texte de la barre, même fenêtre :

    repos avant ......... x = 71,0
    minimum à 9,50 s .... x = 60,8   (dépassement)
    repos après ......... x = 65,4
    → dépassement de 4,6 px, résorbé en ~230 ms

**Ce qui est ÉCARTÉ**

- Ce n'est pas la courbe de traversée : `cubic-bezier(0.22, 1, 0.36, 1)` est
  bornée dans [0,1], elle ne peut pas dépasser.
- Ce n'est pas `sidebarWidth` : il n'est modifié que par la poignée de
  redimensionnement (`AppSidebarLayout.tsx:136, 541`).
- Ce n'est PAS une barre de défilement : le conteneur passe `hideScrollbars`,
  et sur macOS elles sont en superposition — largeur nulle.

**Une mesure FAUSSE, gardée comme avertissement**

Un premier relevé annonçait un « saut de +100 px » du bord (86 → 185). C'était
l'instrument : il cherchait la plus grosse chute de LUMINANCE, or la traversée
estompe le panneau à 0,25 d'opacité — le détecteur attrapait alors un bord
ailleurs dans la fenêtre. Vu seulement en OUVRANT l'image. Sur un panneau qui
s'estompe, ne jamais détecter un bord par la luminance : la saturation, elle,
survit à l'opacité.

**Reste à trouver** : ce qui rétrécit la barre de ~20 px au changement
d'espace. Ce n'est aucun des trois suspects ci-dessus.
