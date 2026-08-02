#!/usr/bin/env bash
# LA VIGIE — ce qui a bougé chez les autres DEPUIS LA DERNIÈRE FOIS.
#
# Pourquoi elle existe
# --------------------
# Raptor cesse d'être un fork qui fusionne pour devenir un produit qui ABSORBE.
# Décision fondateur du 01/08 : « on s'appuie sur une base pour faire notre
# propre sauce ; l'objectif c'est des vigies qui lisent à partir de là où on
# s'est arrêté, et on internalise ce qui est vraiment intelligent ».
#
# Ce que ce script N'EST PAS
# --------------------------
# `gisements.sh` DÉCOUVRE des dépôts à forte substance et faible attention.
# Celui-ci SUIT ceux qu'on a déjà choisis. Le premier ratisse, le second
# surveille. Sans repère, une veille relit éternellement le même terrain :
# `gisements.sh` travaille sur une fenêtre glissante de 90 jours et ne sait
# donc pas ce qu'on a déjà lu.
#
# La règle qui décide de tout
# ---------------------------
# LE REPÈRE NE S'AVANCE JAMAIS TOUT SEUL. Un `--marquer-lu` explicite, et rien
# d'autre. Une avance automatique déclarerait « lu » ce que personne n'a
# ouvert — exactement la case cochée qui a éteint une demande d'Enzo pendant
# des jours (entrée 77 du catalogue Hermès, corrigée le 01/08). Un repère qui
# ment est pire qu'une absence de repère : il éteint la question.
#
# Usage
#   bash scripts/veille/vigie.sh                 # que s'est-il passé depuis ?
#   bash scripts/veille/vigie.sh --marquer-lu    # j'ai VRAIMENT passé en revue
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
REPERES="$RACINE/docs/VEILLE-REPERES.json"
MARQUER=0
[ "${1:-}" = "--marquer-lu" ] && MARQUER=1

[ -r "$REPERES" ] || { printf '✗ repères illisibles : %s\n' "$REPERES"; exit 1; }
command -v gh >/dev/null 2>&1 || { printf '✗ `gh` absent — la vigie ne peut RIEN mesurer. Ne pas conclure « rien de neuf ».\n'; exit 1; }

AUJOURDHUI=$(date -u +%F)
TOTAL_NEUF=0
RESUME=""

NB=$(jq '.depots | length' "$REPERES" 2>/dev/null)
[ -z "$NB" ] && { printf '✗ repères illisibles (json invalide)\n'; exit 1; }

i=0
while [ "$i" -lt "$NB" ]; do
  DEPOT=$(jq -r ".depots[$i].depot" "$REPERES")
  ROLE=$(jq -r ".depots[$i].role" "$REPERES")
  DEPUIS=$(jq -r ".depots[$i].lu_jusqua" "$REPERES")
  i=$((i + 1))

  # G11 : on écrit d'abord, on contrôle le code de sortie, on compte ENSUITE
  # dans le fichier. Compter la sortie d'un `gh` mort rendrait « 0 nouveauté »
  # — un zéro parfaitement crédible, et le pire mensonge possible ici : il
  # ferait croire que l'amont n'a rien fait.
  JOURNAL=$(mktemp)
  gh api "repos/${DEPOT}/commits?since=${DEPUIS}T00:00:00Z&per_page=100" \
    --jq '.[] | "\(.commit.author.date[0:10])  \(.commit.message | split("\n")[0])"' \
    > "$JOURNAL" 2>/dev/null
  CODE=$?
  if [ "$CODE" -ne 0 ]; then
    rm -f "$JOURNAL"
    printf '⚠️  %-34s MESURE IMPOSSIBLE (gh code=%s) — ne pas conclure.\n' "$DEPOT" "$CODE"
    RESUME="${RESUME}\n  ⚠️  ${DEPOT} : non mesuré"
    continue
  fi
  NEUF=$(wc -l < "$JOURNAL" | tr -d ' ')
  # LE PLAFOND DOIT SE VOIR (A7). `per_page=100` est un maximum de l'API :
  # rendre « 100 » quand la vérité est peut-être 400 donnerait un nombre
  # plausible et FAUX, qu'on citerait ensuite. Une limite atteinte se nomme.
  PLAFONNE=""
  [ "$NEUF" -ge 100 ] && PLAFONNE=" (PLAFOND API atteint — il y en a au MOINS autant, pas exactement)"
  TOTAL_NEUF=$((TOTAL_NEUF + NEUF))

  if [ "$NEUF" -eq 0 ]; then
    printf '·  %-34s rien depuis %s\n' "$DEPOT" "$DEPUIS"
  else
    printf '\n▸ %s — %s nouveauté(s) depuis %s%s\n   %s\n' "$DEPOT" "$NEUF" "$DEPUIS" "$PLAFONNE" "$ROLE"
    # On montre les 12 premières : la vigie sert à décider s'il faut aller
    # voir, pas à remplacer la lecture. Un mur de 100 lignes ne se lit pas.
    head -12 "$JOURNAL" | sed 's/^/     /'
    [ "$NEUF" -gt 12 ] && printf '     … et %s de plus — `gh api repos/%s/commits?since=%s`\n' \
      "$((NEUF - 12))" "$DEPOT" "$DEPUIS"
    RESUME="${RESUME}\n  ▸ ${DEPOT} : ${NEUF}"
  fi
  rm -f "$JOURNAL"
done

printf '\n'
if [ "$TOTAL_NEUF" -eq 0 ]; then
  printf '✅ rien de neuf chez les dépôts suivis.\n'
else
  printf '⛔ %s nouveauté(s) à examiner :%b\n' "$TOTAL_NEUF" "$RESUME"
  printf '\n   Ce qui mérite d être internalisé se juge UN PAR UN et s écrit dans\n'
  printf '   docs/CHANTIER-HERMES.md (ou son équivalent) avec un verdict — pris,\n'
  printf '   partiel, ou écarté AVEC SA RAISON. Un écart sans raison revient.\n'
fi

if [ "$MARQUER" -eq 1 ]; then
  # Le geste délibéré, et lui seul, avance le repère.
  TMP=$(mktemp)
  jq --arg d "$AUJOURDHUI" \
    '.depots |= map(.lu_jusqua = $d | .dernier_examen = $d)' "$REPERES" > "$TMP" 2>/dev/null \
    && mv "$TMP" "$REPERES" \
    && printf '\n✍️  repères avancés au %s — tu déclares avoir passé cette liste en revue.\n' "$AUJOURDHUI" \
    || { rm -f "$TMP"; printf '\n✗ repères NON avancés (écriture impossible)\n'; exit 1; }
else
  printf '\n   Repères INCHANGÉS. Quand tu auras vraiment passé la liste en revue :\n'
  printf '   bash scripts/veille/vigie.sh --marquer-lu\n'
fi
