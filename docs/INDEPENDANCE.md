# L'indépendance — le droit de couper, et quand l'exercer

> Décision du 02/08/2026 (Enzo : « on doit être indépendant total »). Ce
> fichier est la réponse : l'indépendance ne s'obtient pas en coupant le
> fork aujourd'hui, elle s'obtient en rendant la coupe GRATUITE le jour où
> elle deviendra juste. Ce jour se reconnaît aux fils-pièges ci-dessous —
> jamais à une humeur.

## Le fait qui commande tout

Couper le fork est un NON-ÉVÉNEMENT le jour J : le code ne change pas d'un
octet, on cesse seulement de RECEVOIR. La coupe elle-même ne peut pas
régresser. Le coût est de l'autre côté — ce qu'on ne recevra plus d'un
amont très actif (mesuré : 14 commits en 60 jours sur un seul fichier
qu'on utilise), contre un fardeau de fusion minuscule (mesuré : 0, 2 et 2
conflits sur les trois dernières synchros, l'unique conflit venant de la
seule fonctionnalité ayant touché un fichier amont).

Le droit de couper est acquis, gratuit, pour toujours. L'exercer trop tôt
est la seule façon de le payer.

## La discipline qui rend la coupe gratuite (en vigueur)

- Toute fonctionnalité du fork vit dans des fichiers NÉS dans le fork.
- Les rares lignes posées dans des fichiers amont sont protégées par des
  gardes à frontière de jeton, testés par mutation (rotation, tuyau d'état,
  garde de fin, second avis — voir leurs `*.test.ts`).
- La synchro nocturne résout les conflits de `.github/workflows/**` en
  notre faveur et alerte bruyamment quand elle échoue.

## Les fils-pièges de coupe — on coupe si L'UN d'eux sonne

1. **Trois synchros consécutives** dont les conflits touchent NOS
   fonctionnalités (pas les workflows) — le fardeau n'est plus minuscule.
2. **Changement de licence ou de direction amont** incompatible avec un
   fork privé qui débranche/rebrande.
3. **Amont endormi** : moins d'activité sur 60 jours que ce que nous
   livrons nous-mêmes — la synchro n'achète plus rien.

## La procédure de coupe (une après-midi)

1. Geler : noter la ref amont exacte dans ce fichier, tag `coupe-amont`.
2. Désactiver le cron de synchro et supprimer `sync-upstream.yml`.
3. Purger les morceaux amont jamais utilisés ici (mobile, relay, vitrines)
   — la suite de tests est le filet, elle doit rester verte à chaque purge.
4. Ouvrir un chantier « protocoles » : les moteurs pilotés (codex,
   opencode) restent des CLients par protocole — rien à couper là.

## Le miroir

Un clone-miroir local vit hors de l'arbre : `~/Documents/t3code-miroir.git`
(`git clone --mirror`). Il protège d'une décision de tiers (GitHub qui
verrouille, une politique qui change), pas d'une panne de disque. Il se
rafraîchit à chaque livraison (`scripts/rafraichir-miroir.sh`) — geste
intégré au flux de livraison, pas une corvée séparée. Un miroir DISTANT
(second hébergeur ou VPS) reste le cran au-dessus : à activer le jour où
Enzo choisit l'endroit.
