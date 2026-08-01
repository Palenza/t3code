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
