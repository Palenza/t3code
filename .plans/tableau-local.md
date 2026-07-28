# Volet « Tableau local » (affiliation / dépôt)

> v2 (28/07 soir, décision Enzo) : l'usine sort de la vue (« rien à foutre »),
> l'AFFILIATION entre — tous les marchands acceptés/en attente/refusés, par
> réseau, avec l'âge du relevé. Source : `data/etat-affiliation.json` du repo
> Palenza, écrit par `scripts/etat-affiliation.mjs` (API des réseaux EN DIRECT ;
> le script émet ce JSON en plus du markdown, même run, zéro parsing fragile).
> Le proxy fusionne `{tableau, affiliation}` et les deux pannes sont isolées :
> l'une muette ne cache jamais l'autre.

## Ce que c'est (fait le 28/07/2026, prouvé à l'écran)

Une page Réglages → « Tableau local » qui montre ce que sert le tableau
`cc-tableau` (`http://127.0.0.1:8318/api/etat`) : l'état usine lu de
`docs/ETAT-LIVE.md` **avec l'âge du relevé**, et l'état du dépôt Palenza
(branche, non-déployé). Les quotas par compte que le tableau sert aussi ne
sont PAS repris ici : les jauges par compte existent déjà sur les cartes de
provider (tranches 1-3 de `quotas-visibles.md`) — pas de doublon.

Fail-soft prouvé : serveur 8318 coupé → « Tableau local muet », la vue ne
casse jamais et se remplit d'elle-même au retour du serveur (poll 60 s +
bouton Rafraîchir).

## Pourquoi un proxy serveur (le point non évident)

Le renderer (Electron, `webSecurity` par défaut) applique le CORS, et
cc-tableau n'envoie aucun en-tête CORS. Un fetch direct du web vers
`127.0.0.1:8318` serait donc TOUJOURS bloqué — la vue serait muette serveur
allumé ou pas. D'où la route `GET /api/tableau-local/etat` sur le backend
(même patron que le proxy OTLP), qui relaie le JSON tel quel. Elle est
volontairement non authentifiée mais **gardée loopback** (adresse source
127.0.0.1/::1 exigée, refus si la source est inconnaissable) : la donnée ne
décrit que la machine du serveur, et seuls les appels de cette machine
passent.

## Où ça vit (coût de synchro amont minimisé)

Fichiers NEUFS (zéro conflit de synchro) :
- `apps/server/src/tableauLocalProxy.ts` (+ test)
- `apps/web/src/components/settings/tableauLocal.ts` (logique pure, + test)
- `apps/web/src/components/settings/TableauLocalSettings.tsx`
- `apps/web/src/routes/settings.tableau-local.tsx`

Coutures dans des fichiers amont (les DEUX seules, minimales et additives) :
- `apps/server/src/server.ts` : 1 import + 1 ligne de montage dans
  `makeRoutesLayer` ;
- `SettingsSidebarNav.tsx` : 1 entrée de nav + 1 membre d'union + 1 icône.

## Garde-fous repris du reste du fork

- Parse défensif : charge utile externe re-vérifiée champ par champ ; ligne
  malformée jetée, jamais inventée ; âge inconnu affiché « âge du relevé
  inconnu », jamais deviné.
- Le lint Effect interdit `fetch` global dans du code Effect → la route
  utilise `HttpClient` (comme le proxy OTLP).
