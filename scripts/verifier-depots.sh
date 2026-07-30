#!/usr/bin/env bash
# Verifie une liste de depots GitHub — existence, derniere activite, licence,
# etoiles REELLES — en quelques secondes, sans consommer un seul agent.
#
# POURQUOI CE SCRIPT EXISTE (30/07/2026)
#
# Une veille multi-agents depensait UN AGENT ENTIER par depot candidat, pour
# repondre a une question purement mecanique : « ce depot existe-t-il, et
# date-t-il de quand ? ». Six angles x huit candidats = jusqu'a 48 agents pour
# ce que `gh api` fait en une boucle.
#
# La bonne separation : les agents pour ce qui demande du JUGEMENT (est-ce
# utile ICI ?), un script pour ce qui est VERIFIABLE (est-ce vivant ?).
#
# Et un effet de bord qui compte : les etoiles rendues ici sont MESUREES. Les
# listes qui circulent en annoncent d'inventees — on a vu « 187k » pour un
# depot inexistant, et 148k annonces pour un depot qui en a 177k.
#
# USAGE
#   scripts/verifier-depots.sh ollama/ollama stanfordnlp/dspy ...
#   scripts/verifier-depots.sh < liste.txt        (un depot par ligne)
#   scripts/verifier-depots.sh --json ...         (sortie machine)

set -uo pipefail

if ! command -v gh > /dev/null 2>&1; then
  echo "gh (GitHub CLI) est requis : brew install gh" >&2
  exit 2
fi

FORMAT=texte
if [ "${1:-}" = "--json" ]; then
  FORMAT=json
  shift
fi

# Les depots viennent des arguments, ou de l'entree standard.
if [ "$#" -gt 0 ]; then
  DEPOTS=("$@")
else
  DEPOTS=()
  while IFS= read -r ligne; do
    # Tolere une URL complete autant qu'un « proprietaire/nom ».
    nettoye=$(printf '%s' "$ligne" | sed -E 's#^https?://github\.com/##; s#/$##; s#[[:space:]]##g')
    [ -n "$nettoye" ] && DEPOTS+=("$nettoye")
  done
fi

if [ "${#DEPOTS[@]}" -eq 0 ]; then
  echo "Aucun depot a verifier." >&2
  exit 1
fi

MAINTENANT=$(date +%s)
[ "$FORMAT" = json ] && printf '['
PREMIER=1

for depot in "${DEPOTS[@]}"; do
  brut=$(gh api "repos/$depot" 2>/dev/null)
  if [ -z "$brut" ] || printf '%s' "$brut" | grep -q '"status":"404"'; then
    if [ "$FORMAT" = json ]; then
      [ "$PREMIER" -eq 0 ] && printf ','
      printf '{"depot":"%s","existe":false}' "$depot"
      PREMIER=0
    else
      printf '  %-42s ✗ N’EXISTE PAS\n' "$depot"
    fi
    continue
  fi

  lu=$(printf '%s' "$brut" | gh api --input - --method GET /dev/null 2>/dev/null) || true
  pousse=$(printf '%s' "$brut" | sed -n 's/.*"pushed_at":"\([^"]*\)".*/\1/p' | head -1)
  licence=$(printf '%s' "$brut" | sed -n 's/.*"spdx_id":"\([^"]*\)".*/\1/p' | head -1)
  etoiles=$(printf '%s' "$brut" | sed -n 's/.*"stargazers_count":\([0-9]*\).*/\1/p' | head -1)
  archive=$(printf '%s' "$brut" | grep -c '"archived":true')

  jours=""
  if [ -n "$pousse" ]; then
    epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$pousse" +%s 2> /dev/null || echo "")
    [ -n "$epoch" ] && jours=$(( (MAINTENANT - epoch) / 86400 ))
  fi

  # Le verdict de VIE, pas de qualite : un depot fige depuis 8 mois n'est pas
  # forcement mauvais, mais il ne doit pas passer pour maintenu.
  vivant=inconnu
  if [ -n "$jours" ]; then
    if [ "$archive" -gt 0 ]; then vivant=archive
    elif [ "$jours" -le 60 ]; then vivant=actif
    elif [ "$jours" -le 240 ]; then vivant=calme
    else vivant=dormant
    fi
  fi

  if [ "$FORMAT" = json ]; then
    [ "$PREMIER" -eq 0 ] && printf ','
    printf '{"depot":"%s","existe":true,"dernierPush":"%s","joursDepuis":%s,"licence":"%s","etoiles":%s,"vie":"%s"}' \
      "$depot" "$pousse" "${jours:-null}" "${licence:-}" "${etoiles:-null}" "$vivant"
    PREMIER=0
  else
    printf '  %-42s %-9s %-14s %-12s %s★\n' \
      "$depot" "$vivant" "${pousse:0:10}" "${licence:-—}" "${etoiles:-?}"
  fi
done

[ "$FORMAT" = json ] && printf ']\n'
exit 0
