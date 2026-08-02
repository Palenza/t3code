#!/usr/bin/env bash
# Rafraîchit le miroir local du dépôt (docs/INDEPENDANCE.md).
#
# Un miroir qui n'est pas rafraîchi ment : il a l'air d'une sauvegarde et
# raconte le mois dernier. Ce script est appelé à chaque livraison ; il crée
# le miroir au premier passage.
set -euo pipefail

MIROIR="${HOME}/Documents/t3code-miroir.git"
SOURCE="https://github.com/Palenza/t3code.git"

if [ ! -d "${MIROIR}" ]; then
  echo "miroir absent — création : ${MIROIR}"
  git clone --mirror "${SOURCE}" "${MIROIR}"
else
  git --git-dir="${MIROIR}" remote update --prune
fi

# Reçu, pas un « OK » nu : la ref de travail et son horodatage.
git --git-dir="${MIROIR}" for-each-ref --format='%(refname:short) %(objectname:short) %(committerdate:iso8601)' refs/heads/travail refs/heads/main
