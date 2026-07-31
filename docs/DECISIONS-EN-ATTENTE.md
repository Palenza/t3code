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

## Et les deux lignes qui n'attendent personne

**n°3 · graphe d'apprentissage** et **n°12 · suggestions d'allowlist**
attendent la même chose : que l'usage s'accumule. La projection couvre 7,3
jours ; il y a 13 refus d'outil enregistrés.

Vérifié le 01/08 : **l'attente est productive dans les deux cas.** Git garde
40 commits de mutations de skills, la projection garde 8 186 activités
d'outil, et la clé qui relie un refus à sa commande a été posée cette nuit —
elle manquait, et sans elle attendre n'aurait rien produit.

Il n'y a donc rien à construire, et rien à décider. Seulement à laisser le
temps passer.
