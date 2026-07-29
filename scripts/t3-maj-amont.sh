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
SALE=$(git status --porcelain)
if [ -n "$SALE" ]; then
  echo "✗ Le dépôt a des modifications non commitées — rien n'est touché."
  echo "$SALE" | head -10
  exit 1
fi

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
NOS_TESTS=(
  "src/sidebarSpacesStore.test.ts"
  "src/sidebarThemeStore.test.ts"
  "src/branding.test.ts"
  "src/components/threadSidebarWidth.test.ts"
  "src/components/SidebarStageBackdrop.test.tsx"
)
NOS_TESTS_SERVEUR=(
  "src/provider/Drivers/ClaudeSharedConfig.test.ts"
  "src/tableauLocalProxy.test.ts"
)

echo "→ [3/5] Fusion dans $BRANCHE"
AVANT_FUSION=$(git rev-parse HEAD)
git checkout "$BRANCHE" --quiet
git pull --ff-only origin "$BRANCHE" --quiet
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

  echo "→ [3bis/5] Nos features tiennent-elles toujours ?"
  export PATH="$REPO/node_modules/.bin:$PATH"
  VERT=1
  (cd "$REPO/apps/web" && vp test run "${NOS_TESTS[@]}") || VERT=0
  if [ "$VERT" -eq 1 ]; then
    (cd "$REPO/apps/server" && vp test run "${NOS_TESTS_SERVEUR[@]}") || VERT=0
  fi
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
node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 --build-version "$VERSION"

DMG=$(ls -t "$REPO"/release/T3-Code-*-arm64.dmg | head -1)
echo "→ [5/5] Prêt : $DMG"
echo "  Quitte l'app puis glisse la nouvelle dans Applications."
open "$DMG"
