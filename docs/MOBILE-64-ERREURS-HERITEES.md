# `apps/mobile` — 64 erreurs de types, et elles ne sont pas de nous

**Mesuré le 01/08.** `tsgo --noEmit -p apps/mobile/tsconfig.json` sort **64
erreurs** chez nous. Le même contrôle sur `upstream/main`, dépendances
réellement résolues, en sort **exactement 64 aussi**.

Ce ne sont donc pas les nôtres. Elles arrivent avec le fork.

## La forme du défaut

Toutes disent la même chose :

```
Argument of type '"ConnectOnboarding"' is not assignable to parameter of type 'never'
```

58 × `TS2345`, 6 × `TS2769`. Un paramètre de navigation qui vaut `never`
signifie que **l'inférence du registre d'écrans s'est effondrée** : un seul
écran mal résolu suffit, et toutes les routes deviennent `never` d'un coup.
Les 64 erreurs sont donc probablement **une seule cause**.

Fichiers les plus touchés : `HomeRouteScreen` (11), `ThreadRouteScreen` (9),
`NewTaskRouteScreen` (6), `AdaptiveWorkspaceLayout` (6) — tous **identiques à
l'amont**.

## Deux hypothèses tuées par la mesure

- **« C'est notre écran de voix. »** Retiré temporairement du registre :
  **64 erreurs quand même**. Faux.
- **« C'est une double copie des types React amenée par le module natif
  `file:`. »** Le module n'a ni dépendances déclarées ni `node_modules`
  propre. Faux.

## LE PIÈGE QUI M'A EU, ET IL FAUT LE LIRE AVANT DE REFAIRE CE TEST

Mon premier « test décisif » a rendu **0 erreur sur l'amont**, et j'en ai
conclu que les 64 étaient à nous. **C'était faux.**

Le worktree amont n'avait pas les `node_modules` des paquets. `pnpm exec` a
tenté un `install`, s'est arrêté sur `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`,
et **tsgo n'a jamais tourné**. Mon `grep -c "error TS"` a compté zéro
occurrence… dans un message d'erreur de pnpm.

> Un `grep -c` sur la sortie d'une commande qui a échoué rend un zéro
> parfaitement plausible. C'est la troisième fois de la journée que ce motif
> me prend — après les 25 branches perdues par `2>/dev/null` et le `cut`
> multi-octets qui rendait un fichier vide.

**La parade, à appliquer désormais** : vérifier le CODE DE SORTIE et la
TAILLE de la sortie avant d'en compter quoi que ce soit. Une commande de
vérification qui rend 18 lignes là où on en attend des centaines n'a pas
vérifié.

Le test correct : relier les `node_modules` de chaque paquet dans le worktree,
puis appeler le binaire `tsgo` directement — sans passer par `pnpm exec`, qui
veut réinstaller.

```bash
for D in apps/mobile apps/server apps/web packages/contracts packages/shared packages/voice-core; do
  ln -sfn "/Users/enzo/Documents/t3code/$D/node_modules" "$D/node_modules"
done
/Users/enzo/Documents/t3code/node_modules/.bin/tsgo --noEmit -p apps/mobile/tsconfig.json
```

## Ce qu'on en fait

**Rien tout de suite, et c'est un choix.** Ces erreurs :

- ne cassent aucun test — les 7 465 passent ;
- ne cassent pas le lancement — l'application mobile est construite par le CI
  de l'amont, qui vit avec ;
- appartiennent à l'amont, donc les corriger chez nous créerait un conflit à
  chaque rattrapage, pour un défaut qui n'est pas le nôtre.

**Ce qui change quand même** : `apps/mobile` n'est plus une zone où un
typecheck vert prouve quelque chose. Toute erreur qu'on y introduirait serait
noyée dans les 64. À surveiller si on se met à écrire du mobile pour de vrai —
le compte doit rester à 64, jamais 65.
