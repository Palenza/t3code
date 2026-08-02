#!/bin/zsh
# t3-maj-amont — PRENDRE les nouveautés de l'amont et reconstruire l'app.
#
# Le circuit que le bouton « Mise à jour » déclenche (demande fondateur
# 29/07 : « on veut pouvoir télécharger la mise à jour, même en cliquant à
# la main »). L'app ne peut pas se mettre à jour toute seule — pas de
# release publiée, et macOS refuse l'auto-update d'une app non signée — donc
# on fait le même travail autrement : on tire le code de Théo, on le fusionne
# dans notre branche (nos features survivent en historique de merge), et on
# reconstruit le DMG en local.
#
# FAIL-LOUD : le moindre pas rouge arrête tout. Un dépôt sale, un conflit de
# fusion, un build cassé — on s'arrête AVANT de toucher à l'app installée, et
# le journal dit exactement où.
set -euo pipefail

REPO="${T3_FORK_REPO:-$HOME/Documents/t3code}"
BRANCHE="${T3_FORK_BRANCH:-travail}"
cd "$REPO"

echo "→ [1/5] État du dépôt"
# Un dépôt sale ne REFUSE plus la mise à jour : il la bloquait pour toujours
# dès qu'un chantier laissait un fichier en vol (vécu 30/07 — le fondateur
# clique « Mettre à jour », reçoit « dépôt pas propre », et ne peut RIEN y
# faire). Les modifications sont mises de côté (stash, non-suivis compris)
# et RESTAURÉES quoi qu'il arrive — trap EXIT, donc aussi sur échec.
STASH_FAIT=0
SALE=$(git status --porcelain)
if [ -n "$SALE" ]; then
  echo "  Modifications non commitées — mises de côté le temps de la mise à jour, restaurées à la fin :"
  echo "$SALE" | head -10
  git stash push -u -m "t3-maj-auto" --quiet
  STASH_FAIT=1
fi
restaurer_stash() {
  if [ "$STASH_FAIT" -eq 1 ]; then
    if git stash pop --quiet; then
      echo "→ Modifications locales RESTAURÉES."
    else
      echo "⚠️ CONFLIT en restaurant tes modifications locales — RIEN n'est perdu :"
      echo "   elles t'attendent dans « git stash list » (t3-maj-auto). Résous avec « git stash pop »."
    fi
  fi
}
trap restaurer_stash EXIT

echo "→ [2/5] Récupération de notre branche de travail"
git remote get-url upstream >/dev/null 2>&1 || \
  git remote add upstream https://github.com/pingdotgg/t3code.git
git fetch upstream main --tags --quiet
git fetch origin "$BRANCHE" --quiet

# ── POURQUOI CE SCRIPT NE FUSIONNE PLUS L'AMONT (03/08) ────────────────────
#
# Il le faisait, et c'était une mine à deux détentes. Vécu ce soir : le
# fondateur clique « Mettre à jour », reçoit « Conflit de fusion » deux fois
# de suite, et l'app ne bouge pas. Le dépôt restait avec un merge à moitié
# fait (10 fichiers en conflit, dont des PNG binaires) ; le clic suivant
# butait sur le cadavre du précédent — donc un blocage DÉFINITIF, jamais un
# incident isolé.
#
# La racine est un doublon de rôle. La synchro nocturne (workflow GitHub)
# fusionne DÉJÀ l'amont dans `travail`, avec sa résolution des conflits de
# workflows et son journal. Le faire AUSSI ici, sur la machine du fondateur,
# c'est demander à un utilisateur de résoudre à la main ce qu'un robot fait
# tous les matins. Et quand la synchro tombe (elle est rouge depuis le
# 01/08 sur `mobile-showcase-screenshots.yml`), la panne du serveur devient
# une panne du BOUTON — deux surfaces cassées pour une seule cause.
#
# Mettre à jour l'app, c'est donc désormais : prendre notre branche, et
# reconstruire. Le retard sur l'amont reste MESURÉ et affiché par la
# pastille (`amontBehind` dans forkUpdate.ts) — on informe, on ne fusionne
# pas dans le dos de l'utilisateur.
RETARD_AMONT=$(git rev-list --count "HEAD..upstream/main")
echo "  Pour information : $RETARD_AMONT commit(s) d'avance chez Théo (la synchro nocturne les prend)"

echo "→ [3/5] Mise à niveau de $BRANCHE"
git checkout "$BRANCHE" --quiet
git pull --ff-only origin "$BRANCHE" --quiet
# Le commit d'où sort ce build — cité en cas d'échec, pour savoir sur quoi
# on est retombé. `--ff-only` garantit qu'aucun commit local ne s'y glisse.
COMMIT_CONSTRUIT=$(git rev-parse HEAD)
echo "  À jour sur $(git rev-parse --short HEAD)."

echo "→ [4/5] Construction du DMG (quelques minutes)"
export PATH="$REPO/node_modules/.bin:$PATH"
VERSION=$(node -p "require('$REPO/apps/desktop/package.json').version")
# Le build a SA propre garde. Sans elle, un échec ici laissait le dépôt
# fusionné, l'app non reconstruite, et le script continuait jusqu'à ouvrir
# un DMG ANCIEN comme s'il était neuf. C'est arrivé le 30/07 : `cargo`
# manquait, le build mourait, et rien ne le disait à l'utilisateur.
if ! node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 --build-version "$VERSION"; then
  echo "✗ La construction du DMG a échoué — l'app installée n'a PAS changé."
  echo "  Le dépôt est sur $COMMIT_CONSTRUIT ; il n'a pas bougé."
  exit 5
fi

# Le DMG doit porter LA version qu'on vient de construire. Prendre « le plus
# récent » ouvrirait un ancien fichier si le build avait échoué sans le dire.
# Le nom du DMG a suivi le débranding (« T3 Code » → « Raptor »), et le
# deviner à partir d'un préfixe en dur a déjà ouvert un fichier PÉRIMÉ.
# On prend donc le plus récent QUI PORTE LA VERSION construite, et on exige
# qu'il ait été écrit à l'instant : un DMG vieux de trois jours qui s'ouvre
# comme s'il était neuf est la panne la plus trompeuse de ce script.
DMG=$(ls -t "$REPO"/release/*"$VERSION"-arm64.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ] || [ -z "$(find "$DMG" -mmin -30 2>/dev/null)" ]; then
  echo "✗ Aucun DMG FRAIS en version $VERSION — rien n'est ouvert."
  exit 5
fi
echo "→ [5/5] Prêt : $DMG"
echo "  Quitte l'app puis glisse la nouvelle dans Applications."
open "$DMG"
