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

echo "→ [2/5] Récupération de l'amont (pingdotgg/t3code)"
git remote get-url upstream >/dev/null 2>&1 || \
  git remote add upstream https://github.com/pingdotgg/t3code.git
git fetch upstream main --tags --quiet
git fetch origin "$BRANCHE" --quiet

RETARD=$(git rev-list --count "HEAD..upstream/main")
echo "  $RETARD commit(s) d'avance chez Théo"

# Les fichiers qui portent NOS features : un merge git n'écrase jamais en
# silence — il S'ARRÊTE sur conflit — mais il peut passer proprement et
# casser la LOGIQUE (l'amont refactore, notre greffe ne suit plus). C'est ce
# cas-là que le filet ci-dessous attrape (crainte fondateur 29/07 : « s'ils
# implémentent le voice et que ça vient écraser ce que l'on a fait »).
# Cette liste écrite à la main portait SEPT fichiers. Le fork en a ajouté
# CINQUANTE-NEUF. N'y figuraient ni la dictée vocale, ni le pool de comptes,
# ni le relais, ni les modes de travail — c'est-à-dire précisément les
# features dont la crainte ci-dessus parle. Le filet annonçait « Nos features
# tiennent » après avoir ignoré les cinq sixièmes d'entre elles (audit 30/07).
#
# On lance donc TOUT. Une liste tenue à la main vieillit à chaque feature
# ajoutée ; un « tous les tests » ne vieillit jamais.

echo "→ [3/5] Fusion dans $BRANCHE"
git checkout "$BRANCHE" --quiet
git pull --ff-only origin "$BRANCHE" --quiet
# APRÈS le checkout et le pull, jamais avant : capturé plus tôt, un lancement
# depuis une autre branche ferait du rollback un hard-reset vers le mauvais
# commit — et --ff-only garantit qu'aucun commit local n'existe entre les deux.
AVANT_FUSION=$(git rev-parse HEAD)
if [ "$RETARD" -gt 0 ]; then
  # --no-edit : le message de merge par défaut suffit. En cas de conflit,
  # git s'arrête ici et `set -e` nous fait sortir : l'arbre reste en état de
  # conflit visible, à résoudre à la main, et l'app installée n'a pas bougé.
  if ! git merge upstream/main --no-edit; then
    echo "✗ Conflit de fusion — l'app n'a PAS été touchée."
    echo "  Résous les conflits dans $REPO puis relance."
    exit 2
  fi
  echo "  Fusion faite."

  # Les dépendances AVANT les tests. Cette fusion-ci a changé la liste des
  # paquets (+122 lignes de verrou) ; tester contre l'ancien état donne soit
  # un faux vert, soit un échec qu'on rapporterait comme « l'amont casse une
  # de nos features » — un faux diagnostic qui ferait jeter une bonne fusion.
  echo "→ [3bis/5] Dépendances de l'amont"
  export PATH="$REPO/node_modules/.bin:$PATH"
  if command -v pnpm > /dev/null 2>&1; then
    if ! (cd "$REPO" && pnpm install --silent); then
      echo "✗ Dépendances non installables — on ne teste pas à l'aveugle."
      git reset --hard "$AVANT_FUSION" --quiet
      exit 4
    fi
  else
    echo "  pnpm absent : dépendances NON rafraîchies, les tests portent sur l'ancien état."
  fi

  echo "→ [3ter/5] Nos features tiennent-elles toujours ?"
  VERT=1
  # TOUS les tests du dépôt, pas une liste tenue à la main.
  (cd "$REPO" && vp run -r test) || VERT=0
  if [ "$VERT" -eq 0 ]; then
    echo "✗ La mise à jour de l'amont CASSE une de nos features."
    echo "  Fusion annulée, retour à $AVANT_FUSION — l'app installée n'a pas bougé."
    git reset --hard "$AVANT_FUSION"
    exit 3
  fi
  echo "  Nos features tiennent. Pense à pousser : git push origin $BRANCHE"
else
  echo "  Déjà à jour avec l'amont."
fi

echo "→ [4/5] Construction du DMG (quelques minutes)"
export PATH="$REPO/node_modules/.bin:$PATH"
VERSION=$(node -p "require('$REPO/apps/desktop/package.json').version")
# Le build a SA propre garde. Sans elle, un échec ici laissait le dépôt
# fusionné, l'app non reconstruite, et le script continuait jusqu'à ouvrir
# un DMG ANCIEN comme s'il était neuf. C'est arrivé le 30/07 : `cargo`
# manquait, le build mourait, et rien ne le disait à l'utilisateur.
if ! node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 --build-version "$VERSION"; then
  echo "✗ La construction du DMG a échoué — l'app installée n'a PAS changé."
  echo "  La fusion, elle, est faite. Pour l'annuler : git reset --hard $AVANT_FUSION"
  exit 5
fi

# Le DMG doit porter LA version qu'on vient de construire. Prendre « le plus
# récent » ouvrirait un ancien fichier si le build avait échoué sans le dire.
DMG="$REPO/release/T3-Code-$VERSION-arm64.dmg"
if [ ! -f "$DMG" ]; then
  echo "✗ Aucun DMG en version $VERSION — rien n'est ouvert."
  exit 5
fi
echo "→ [5/5] Prêt : $DMG"
echo "  Quitte l'app puis glisse la nouvelle dans Applications."
open "$DMG"
