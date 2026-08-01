# On n'est plus un fork qui fusionne — on est un produit qui absorbe

Décision fondateur du **01/08/2026**, et elle change la doctrine :

> « On est un fork, ok, mais tout ce qu'on a rajouté par-dessus c'est à nous,
> toutes les idées c'est à nous. On s'appuie juste sur une base pour faire
> notre propre sauce. L'objectif c'est de mettre des vigies qui vont analyser
> à partir de là où nous allons arrêter de lire le code, et par rapport à nos
> avancements, comparer à chaque fois leurs mises à jour — et si tout le monde
> est d'accord, internaliser ce qui est ultra intelligent. »

## Ce que ça annule

Jusqu'ici, l'argument contre la divergence était le **coût de rattrapage** :
l'amont pousse ~149 commits/jour (mesuré le 01/08), et chaque divergence se
repaie à chaque fusion. Cet argument **tombe** si on cesse de fusionner. Il ne
faut donc plus le ressortir : il était conditionnel, la condition a sauté.

## Ce que ça coûte, et il faut le savoir

En se détachant, on renonce à du travail gratuit : correctifs de sécurité,
montées d'Electron et du SDK, corrections de bugs que l'amont fait pour nous.
La vigie est la réponse à ça — elle transforme « je fusionne tout » en
« j'absorbe ce que je choisis ». Plus de travail par élément, mais chaque
élément est **décidé**, et aucun n'arrive par surprise.

Ce n'est pas gratuit et ce n'est pas neutre : c'est un échange assumé.

## Le mécanisme

`scripts/veille/vigie.sh` + `docs/VEILLE-REPERES.json`.

Un **repère par dépôt** — jusqu'où on a lu. Ce qui est après est à examiner.
Trois règles, chacune née d'une panne déjà payée :

1. **Le repère ne s'avance JAMAIS tout seul.** `--marquer-lu` est un geste
   délibéré. Une avance automatique déclarerait « lu » ce que personne n'a
   ouvert — la case cochée qui ment, payée le 01/08 sur l'entrée 77 du
   catalogue Hermès : elle a éteint une demande d'Enzo pendant des jours.
2. **Une mesure impossible se DIT.** Si `gh` échoue, on écrit « non mesuré »,
   jamais « rien de neuf ». Compter la sortie d'une commande morte rend un
   zéro parfaitement crédible — trois fois le 01/08, chacune ayant produit une
   conclusion fausse.
3. **Le plafond de l'API se NOMME.** `per_page=100` rend au plus 100 : afficher
   « 100 » quand la vérité est peut-être 400 donnerait un nombre plausible et
   faux, qu'on citerait ensuite. Vu au premier run réel sur `hermes-agent`.

### Ce qu'il ne fait PAS, délibérément

Il n'absorbe rien tout seul. Il liste, il ne juge pas. Chaque élément retenu
se tranche un par un et s'écrit avec son **verdict** — pris, partiel, ou
écarté **avec sa raison**. Un écart sans raison revient tous les mois.

## Il ne remplace pas `gisements.sh`

`gisements.sh` **découvre** : il cherche les dépôts à forte substance et faible
attention, ceux que personne ne regarde. `vigie.sh` **suit** ceux qu'on a déjà
choisis. Le premier ratisse, le second surveille. Sans repère, une veille relit
éternellement le même terrain — c'est précisément ce que faisait `gisements.sh`
avec sa fenêtre glissante de 90 jours.

## Premier run réel (01/08)

109 nouveautés : `pingdotgg/t3code` 1 · `NousResearch/hermes-agent` ≥100
(plafond) · `obsidianmd/obsidian-releases` 8.

Et il a immédiatement trouvé un défaut dans sa propre liste : les 8 commits
d'Obsidian sont des « Mirror community plugins » automatiques. Ce dépôt est un
miroir de publication, pas la source (fermée). **Il ne tient pas le rôle qu'on
lui a écrit.** Une vigie qui regarde à côté coûte de l'attention et rend un
faux « rien de neuf » — noté dans les repères, à remplacer ou à retirer.

## La règle d'écriture des repères

Si on ne sait pas écrire **pourquoi** on regarde un dépôt, on ne le regarde
pas. Le champ `role` n'est pas décoratif : c'est lui qui permet de dire, comme
ci-dessus, qu'un dépôt suivi ne sert à rien.
