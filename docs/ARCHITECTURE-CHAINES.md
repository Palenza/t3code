# Les chaînes — comment on construit sans casser ce qu'on a construit

> Carte de couplage des 85 chantiers. Se lit AVANT de choisir sur quoi
> travailler. L'état de chaque chantier vit dans `CHANTIER-HERMES.md` ; ici on
> ne dit qu'une chose : **qui parle à qui, et dans quel ordre ça se pose.**

## Le code d'Hermès est SUR DISQUE — on le lit, on ne le devine pas

    ~/.hermes/hermes-agent

`agent/` 165 fichiers · `tools/` 119 · `hermes_cli/` 224 · `gateway/` 80 ·
`cron/` 11 · `plugins/` 188 · `skills/` 68.

### La règle de confiance (décision fondateur, 31/07)

> « Ça fait un an qu'ils existent et ce sont les plus connus au monde dans leur
> domaine. On peut leur faire confiance à la base. Après, il faut juste
> l'adapter si besoin pour Raptor. »

Opérationnalisée en deux lignes, parce que la journée a produit les quatre cas
qui disent où la frontière passe :

**Leur DONNÉE — confiance totale, on copie.** Motifs, listes d'adresses,
seuils, catégories, et surtout **les pièges écrits dans leurs commentaires**.
C'est un an d'attaques et d'incidents réels ; les re-dériver, c'est payer deux
fois. Sur les IP mappées `::ffff:`, leur donnée était juste et c'est MON
portage qui était faux — la confiance aurait mieux marché que ma prudence.

**Leur CONCEPTION — une seule question : « qu'est-ce que ça suppose de leur
architecture ? »** On diverge sur trois points connus, et toute l'adaptation
tient là :

| leur socle            | le nôtre                           |
| --------------------- | ---------------------------------- |
| boucle d'agent propre | SDK `claude-agent-sdk`             |
| API facturée au token | comptes Max personnels en rotation |
| état en fichiers      | projection SQLite                  |

Trois fois le 31/07 cette question a changé la réponse : leur sidecar
`.usage.json` (bonne réponse chez eux, défaut ACTIF chez nous), le blocage du
CGNAT (juste chez eux, à ne pas faire chez nous — Tailscale y vit),
`credential_files.py` (sans objet — on n'a pas de terminal en conteneur).

**Avant d'écrire un maillon, on ouvre le fichier d'Hermès qui le porte.** Pas
pour le porter ligne à ligne — leur moteur n'est pas le nôtre — mais parce que
leurs 2 000 lignes contiennent les cas limites qu'ils ont payés et qu'on
paierait à nouveau. Le n°2 en est l'exemple : leur sidecar `.usage.json` est la
bonne réponse chez eux et un défaut ACTIF chez nous, et c'est en lisant leur
fichier qu'on l'a vu.

Les quatre prochains, avec leur taille réelle :

| chantier                | fichier                                           | lignes |
| ----------------------- | ------------------------------------------------- | ------ |
| n°13 patterns de menace | `tools/threat_patterns.py` + `tirith_security.py` | 871    |
| n°11 approbation        | `tools/approval.py`                               | 4 161  |
| n°10 scanner de skills  | `tools/skills_guard.py`                           | 1 153  |
| n°1 curateur            | `agent/curator.py`                                | 2 019  |

## Le problème que ce fichier existe pour résoudre

Le 31/07 au matin j'ai écrit `SortieDOutil.ts` — la porte par laquelle tout ce
que nos outils rendent au modèle doit passer. Son en-tête la déclarait
« PORTE OBLIGATOIRE », avec cette phrase : _« une transformation qu'on peut
oublier de brancher finit par être oubliée »_.

Le soir même, en comptant : **deux toolkits sur six ne la traversaient pas.**
Écrite le matin, déjà trouée le soir, par moi.

Le trou n'était pas dans la porte. Il était dans le fait que **rien ne
vérifiait qu'elle était branchée partout**. Une règle dans un commentaire n'a
jamais arrêté personne — pas même son auteur, huit heures plus tard.

D'où les deux lois de ce fichier.

## Loi 1 — un lien qui n'est pas testé n'existe pas

Un module qui en appelle un autre, c'est un fait vérifiable par le compilateur.
Un module qui **doit** en appeler un autre — « tout ce qui sort passe par la
porte », « aucune skill n'entre sans le scanner » — n'est vérifié par rien. Ce
sont ces liens-là qui cassent, et ils cassent en silence.

**Chaque chaîne porte donc un INVARIANT, et l'invariant est un test
structurel** : il énumère les fichiers sur disque et échoue quand un nouveau
membre esquive le passage obligé. Pas une convention. Pas une revue. Un rouge.

Modèle à recopier : `apps/server/src/mcp/porteDeSortie.chaine.test.ts`.

## Loi 2 — l'invariant se pose au DEUXIÈME maillon, jamais au dixième

Au premier maillon, l'invariant est évident et inutile. Au dixième, il est
faux depuis longtemps et personne ne sait quand ça a lâché. Le bon moment est
le deuxième : c'est là que « il faudra que les autres fassent pareil » devient
une phrase qu'on prononce — et une phrase prononcée doit devenir un test dans
la même heure.

---

## Étage 0 — le socle

Ce qui porte tout le reste. On n'y touche pas sans dérouler ce que ça casse
au-dessus (A5b).

| pièce                          | rôle                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `projection_thread_activities` | le flux d'activité que T3 enregistre déjà — lu par `preuve`, `usage-skills`, `dette`, sans instrumentation |
| `SortieDOutil` + `Caviarder`   | la porte de sortie : caviardage et borne de poids                                                          |
| `comptePool` + SDK Claude Code | le moteur. On ne le réécrit pas                                                                            |
| `node:sqlite` + migrations     | l'état. FTS5 et `backup()` prouvés disponibles                                                             |

**Invariant** — tout ce qui sort vers le modèle traverse la porte.
**Test** — `porteDeSortie.chaine.test.ts` ✅ _(posé le 31/07, après la panne)_

---

## Chaîne A · LE CONTEXTE — ce qui occupe la fenêtre

La chaîne la plus chère aujourd'hui, et c'est mesuré : 9 compactages en 7
jours, chacun jetant 97,5 à 98,6 % de la fenêtre, 22 minutes d'attente morte
sur la semaine. Et ce qui la remplit, mesuré correctement : **54 % de
résultats d'outils**, 22 % d'appels d'outils, 17 % de ce que l'humain écrit,
5 % de ce que l'agent répond — et **2,5 % d'images**.

```
n°5 rappel ✅ ──┬── n°6 tokenizer CJK        (étend le même index FTS)
                └── n°56 export ✅(moitié)   (lit les mêmes messages)

n°24 hygiène ✅(moitié) ── n°24b DÉBORDEMENT SUR DISQUE  ← le prochain
n°27 lecture ✅(moitié) ── n°55 compression dirigée
n°9 dette ✅ ─────────────  n°85 backends de mémoire
Compactage ✅
```

**Ordre forcé** : mesurer avant de borner, borner avant de faire déborder. Le
plafond existe déjà (`PLAFOND_SORTIE`) mais il **avertit sans agir** — la
sortie complète part quand même. Le débordement sur disque est donc le
maillon qui rend le plafond vrai.

**Invariant** — aucune sortie au-dessus du plafond n'atteint le modèle sans
qu'un fichier porte l'intégralité (H6 : rien ne se jette).
**Test** — à écrire avec n°24b.

---

## Chaîne B · LES SKILLS — le savoir de l'agent

```
n°4 /learn ── n°10 scanner ✅ ── n°1 curateur ✅ ── n°3 graphe
   fabrique      valide          cure           enregistre
                                   ▲
                   n°2 télémétrie ✅┘  (sans elle, il juge à l'aveugle)

n°10 scanner ── n°50 hub ── n°51 les 182 skills ── n°52 bundles ── n°53 index
```

**Ordre strictement forcé, deux fois** :

- le curateur ARCHIVE : sans télémétrie il juge à l'aveugle. C'est pour ça que
  le n°2 est passé avant, et qu'il répond `indécidable` tant que la fenêtre
  d'observation ne couvre pas la vie de la skill ;
- le scanner PRÉCÈDE le hub. Importer 182 skills tierces avant de savoir les
  valider, c'est importer du code hostile en connaissance de cause (I2).

**Invariant** — aucune skill n'entre sans passer le scanner ; aucune n'est
archivée sans un verdict d'usage décidable.
**Piège connu** — écrire dans un dossier de skill change l'empreinte que
`signatureDesSkills` surveille : tout compteur déposé là déclenche un
`reloadSkills()` par tour. La télémétrie lit la projection, jamais le disque.

---

## Chaîne C · LE DROIT D'AGIR — ce que l'agent peut faire

```
n°21 chemins ✅   n°17 rédaction ✅   n°23 garde-fous ✅
        │
        └── n°13 patterns de menace ── n°11 approbation ── n°12 allowlist suggérée
                                              │
                                              └── n°19 hooks shell

à côté, sans ordre entre eux : n°14 URL · n°15 OSV · n°16 secrets externes
                               n°18 permissions credentials · n°20 audit démarrage
```

**Ordre forcé** : les patterns alimentent l'approbation ; l'allowlist se
suggère à partir de ce qui a été approuvé. Construire l'approbation avant les
patterns, c'est un juge sans code pénal.

**Cette chaîne précède l'import de la chaîne B.**

**Invariant** — toute action à effet passe par un point de décision unique. Le
garde de Palenza a prouvé le mode de panne inverse : une règle par cas, et la
cinquième morsure vient d'un cas qu'aucune règle ne couvrait.

---

## Chaîne D · LA BOUCLE — comment un tour se déroule

```
n°22 preuve ✅ ── n°23 ✅ ── n°75 timeouts de raisonnement

n°8 /goal (la boucle Ralph) ── n°54 conduite fine (/steer, /queue, /busy)
                                        └── n°45 /clarify (bloque et attend)

n°7 PTC ── n°26 délégation ── n°30 registre de processus
```

**Invariant, et c'est le plus fragile de tous** : la continuation est un
message NORMAL. Une boucle qui réinjecte un préambule casse le cache de
prompt à chaque tour — le coût explose sans que rien ne rougisse.

**Ordre forcé** : `/goal` avant `/steer` (on ne pilote pas une boucle qui
n'existe pas), PTC avant la délégation (déléguer, c'est appeler nos outils
depuis ailleurs).

---

## Chaîne E · LA PASSERELLE — T3 hors de la machine

```
n°37 socle ── n°38 streaming ── n°39 livraison ── n°40 authz
                                                      └── n°41 SDK plateforme
                                                              └── n°42 Telegram, puis les autres
                                                                      └── n°43 cycle de vie
                                                                              └── n°44 /handoff, /sethome
```

La seule chaîne **strictement linéaire** : rien ne marche sans le n°37 (bail
de tour — un seul écrivain). C'est aussi la plus grosse. Elle ne se commence
pas en fin de journée.

---

## Chaîne F · L'EXPLOITATION — savoir ce qui se passe

```
n°46 doctor ✅ ── n°61 classification d'erreurs ── n°59 inventaire ── n°60 observabilité
n°33 sauvegarde ✅ ── n°35 récupération de session ── n°57 mise à jour ── n°58 désinstallation
n°48 blueprints ✅ ── n°49 suggestions ✅ ── n°47 cron intégré
```

**Note honnête sur le n°35** : vérifié le 31/07, T3 copie les transcripts
OCTET PAR OCTET sans les analyser — il n'y a pas là la panne qu'Hermès répare.
À rouvrir seulement si une corruption réelle apparaît (RÈGLE SUPRÊME).

**Le n°47 vient APRÈS le n°49** : proposer une automatisation qu'on ne sait
pas encore exécuter est une promesse, pas une fonctionnalité.

---

## Chaîne G · LES SURFACES — ce que l'humain voit et entend

n°63 navigateur · n°64 computer use · n°65 mot d'éveil · n°66 TTS ·
n°69 image/vidéo · n°70 vision · n°76 skins · n°77 i18n · n°78 vue focus ·
n°79 bannière · n°80 achievements · n°81 tableaux · n°82 migration

**Aucune ne bloque une autre.** C'est la réserve : ce qu'on prend quand une
chaîne est bloquée par une décision qui appartient au fondateur.

**⚠️ G N'EST PAS UNE CHAÎNE, et c'est officiel.** Passée à l'épreuve de la
question qui révèle un invariant — _« quelle phrase deviendrait fausse si un
membre faisait autrement ? »_ — G est la seule des huit à ne rien produire.
Rien ne relie un mot d'éveil ONNX à un moteur de skins. C'est un SAC, et le
nommer ainsi est un verdict utile : on n'y cherche pas d'ordre, on n'y pose
pas d'invariant, on y pioche.

## Chaîne H · LE TRAVAIL ORGANISÉ

n°67 kanban ── n°68 projets ── n°83 trajectoires. Se pose sur D (la
délégation) : un kanban qui ne peut pas déléguer est un fichier texte.

---

## L'ordre entre les chaînes

La règle : **on construit d'abord la chaîne dont l'invariant protège le plus
de travail futur.**

1. **Finir A** — le débordement sur disque. La mesure du jour le désigne : le
   plafond avertit sans agir, et c'est le premier poste de dépense de la
   fenêtre.
2. **C jusqu'au n°11** — avant que B n'importe du code tiers.
3. **B** — curateur d'abord (il n'attend plus rien), hub ensuite.
4. **D** — la boucle. Grosse, mais elle change comment tout le reste tourne.
5. **F** — l'exploitation.
6. **E** — la passerelle. Un chantier à part entière, pas une fin de journée.
7. **G / H** — à la demande, ou quand une chaîne est bloquée.

## Les invariants, en un tableau

C'est la colonne de droite qui compte : un invariant sans test est une
intention.

| chaîne               | l'invariant                                                                                   | testé ?                                  |
| -------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Étage 0              | TOUT ce qui sort vers le modèle traverse la porte                                             | ✅ `porteDeSortie.chaine.test.ts`        |
| A · contexte         | AUCUNE sortie au-dessus du plafond n'atteint le modèle sans qu'un fichier porte l'intégralité | ✅ `porteDeSortie.chaine.test.ts`        |
| B · skills           | AUCUNE skill n'entre sans le scanner ; AUCUNE n'est archivée sans verdict décidable           | ❌ à écrire avec n°10                    |
| C · droit d'agir     | TOUTE action à effet passe par un point de décision unique                                    | ✅ `WorkspaceFileSystem.liens.test.ts`   |
| D · la boucle        | TOUTE continuation est un message NORMAL, jamais un préambule                                 | ❌ à écrire avec n°8                     |
| E · passerelle       | TOUT tour a un seul écrivain (le bail de tour)                                                | ❌ à écrire avec n°37                    |
| F · exploitation     | TOUT échec non reconnu entre au carnet, jamais avalé                                          | ❌ le carnet existe, l'invariant non     |
| G · surfaces         | — _aucun formulable : c'est un sac_                                                           | sans objet                               |
| H · travail organisé | TOUTE tâche déléguée a un propriétaire et un état lisible                                     | ⚠️ ne nomme pas encore de passage obligé |

## Ce que cette carte n'a pas tranché (v2)

- **A et D se disputent le n°55** (compression dirigée). Placé dans A parce
  qu'il touche la fenêtre, mais il pilote la boucle. Si `/goal` arrive avant,
  il migre.
- **C est la chaîne la plus dangereuse et la seule sans invariant testé.**
  Elle repose encore entièrement sur des règles écrites — exactement la forme
  qui a lâché deux fois le 31/07. À poser au moment du n°13, pas après.
- **H ne nomme pas encore son passage obligé.** « Un propriétaire et un état
  lisible » est presque un invariant : il lui manque le module par lequel tout
  passe. À durcir avant de commencer le n°67.
- **Résolu en v2** : G est bien un sac, confirmé par l'épreuve de la question.
