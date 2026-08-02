# Activations — ce qui est ÉCRIT mais pas encore BRANCHÉ

M10 : une dépendance externe ou un câblage de comportement se note ici le jour
où il naît, avec quoi activer, où, et comment le prouver. Le module vit ; il
lui manque son dernier fil.

## Détecteur de régression de cache — `provider/SanteDuCache.ts`

**Ce qui est fait, prouvé, vert.** Le module pur qui lit la ventilation
`cache_read` / `cache_creation` d'un tour et crie quand le cache se reconstruit
au lieu de se lire (le motif `--resume` de r/ClaudeCode, 10-20× le coût). 12
tests, deux règles porteuses prouvées par mutation.

**Le fil qui manque, et pourquoi je ne l'ai pas tiré seul.** L'appeler en
direct dans `ClaudeAdapter` :

- touche le chemin le plus chaud du système (7 sites appellent
  `emitThreadTokenUsage`) ;
- change un comportement (D2) : il faut décider « premier tour » sans faux
  positif — mal fait, il crie à CHAQUE première réponse (classe A5b) ;
- ne se prouve en LIVE que par une reconstruction (D4), que tu as verrouillée
  (« arrête d'empiler les DMG tant que je ne le dis pas »).

**Le câblage exact, quand tu donnes le GO :**

1. dans `emitThreadTokenUsage` (`ClaudeAdapter.ts` ~1792), le `context` est en
   portée (`context.turns.length` → premier tour = longueur ≤ 1) ;
2. la ventilation brute est dans `options.rawPayload` → `lireVentilation(...)` ;
3. si `santeDuCache(...)` rend `CACHE RECONSTRUIT`, émettre via
   `emitRuntimeWarning(context, verdict.pourquoi)` — le canal BRUYANT existe
   déjà (I5) ;
4. preuve : étendre `ClaudeAdapter.test.ts` avec un message de usage à
   `cache_read ≈ 0, cache_creation = tout`, hors premier tour → le warning
   doit sortir. Puis reconstruction + un vrai `--resume` observé.

**Coût si on ne l'active pas :** une facture qui décuple reste invisible. Le
détecteur est écrit ; tant qu'il n'émet pas, il ne protège personne — c'est
exactement ce que mon garde du troisième étage (`JamaisExecute.ts`) nomme.

## GitHub — trois gestes qui n'appartiennent qu'à Enzo (02/08/2026)

Raptor est câblé dans GitHub : la CI existe, la release existe, la synchro est
réparée. Tout est écrit et poussé. Trois choses ne peuvent pas se faire sans
toi, et rien n'avance tant qu'elles ne sont pas faites.

### 1. Débloquer le faux positif de secret — 10 secondes

**Le lien :** https://github.com/Palenza/t3code/security/secret-scanning/unblock-secret/3HLUd9kP0AVVdiM3cjZgg7i0ZOc

La protection anti-secret de GitHub refuse TOUTE poussée qui transporte le
commit `8be2f82c1`, à cause de cette ligne de
`apps/server/src/secrets/Caviarder.test.ts:58` :

```
["slack xoxb-123456789012-abcdefghijklmn", "xoxb-1"],
```

C'est un LEURRE de test, dans un test qui vérifie qu'on caviarde bien les
jetons. Ses quatre voisins sont des leurres identiques (`sk-ant-api03-AAAA…`,
`ghp_BBBB…`, la clé d'exemple documentée d'AWS). **Il n'y a rien à révoquer.**

Pourquoi je ne l'ai pas fait moi-même : lever un contrôle de sécurité sur ton
dépôt est une décision qui t'appartient, même quand la vérification est faite.
Et pourquoi je n'ai pas réécrit l'histoire à la place : le commit est aussi sur
`travail`, qui est poussée et que la synchro fusionne. Réécrire ferait diverger
191 commits — chaque commit dupliqué pour toujours, et `travail` est justement
en cours de fusion dans une autre session. Le remède serait pire que le mal.

**Ce que ça débloque :** la poussée de `arc-fidelite`, donc TOUT le travail
applicatif du 02/08 (réflexion visible, débranding, connexions, recherche).

### 2. Fusionner la PR #11 — https://github.com/Palenza/t3code/pull/11

Elle porte les trois workflows. La CI y tourne déjà (c'est la preuve qu'ils
fonctionnent), mais deux choses n'arrivent qu'après la fusion :

- **`Raptor Release` n'apparaîtra dans l'onglet Actions qu'une fois sur `main`**
  — GitHub n'enregistre un déclencheur manuel que depuis la branche par défaut.
- **La synchro amont ne se répare qu'à ce moment-là.** Elle est morte depuis le
  01/08 et le correctif est dans cette PR.

### 3. Décider du compte Apple Developer — ou assumer son absence

Sans signature, `electron-updater` refuse d'installer une mise à jour sur
macOS. Nos releases GitHub se téléchargeront donc à la main : DMG, clic droit →
Ouvrir la première fois, glisser dans Applications. C'est écrit dans les notes
de version que le workflow génère, pour que personne ne le découvre en le
subissant.

Ta décision du 29/07 était « pas de compte à 99 € ». Rien ne la remet en cause
— mais maintenant que la release existe, c'est elle qui sépare « télécharger
et glisser » de « le bouton Update fait tout ».

**Ce qui NE dépend pas de toi et qui est déjà fait :** les workflows sont
écrits, validés syntaxiquement, et la logique de fusion a été rejouée sur le
vrai conflit du 01/08 avant d'être posée.
