#!/usr/bin/env bash
# GISEMENTS — trouver les dépôts à FORTE SUBSTANCE et FAIBLE ATTENTION.
#
# Pourquoi ce script existe
# -------------------------
# La veille du 01/08 a classé une semaine entière à l'étoile, puis mesuré que
# l'étoile ne classe pas : obra/superpowers a plus d'étoiles que React (264 456
# contre 246 821) avec 38 contributeurs contre 411. Et ~6 M de fausses étoiles
# sont documentées sur GitHub, l'outillage IA en tête.
#
# Le gisement qu'on cherche est l'INVERSE du dépôt viral : quelqu'un qui écrit
# beaucoup, teste beaucoup, itère beaucoup — et que personne ne regarde.
#
# La mesure
# ---------
# ATTENTION  = étoiles.
# SUBSTANCE  = commits d'HUMAINS et auteurs HUMAINS distincts, sur 90 jours.
# GISEMENT   = substance élevée / attention basse.
#
# Trois pièges découverts au PREMIER forage, et qui rendaient le classement
# entièrement faux — gardés ici parce qu'ils reviendraient sinon :
#
#   1. LES FORKS HÉRITENT du parent. `Bl4ckBl1zZ/t3code` sortait 2e avec 212
#      contributeurs et 0 étoile : c'est un fork de notre propre amont. Un fork
#      de gros projet gagne toujours. → `fork:false`, ET revérifié par dépôt.
#   2. LES BOTS FONT DES PR. `cbrenner04/jarvis` sortait 1er : 2 422 PR pour
#      UN contributeur — du Dependabot sur un dépôt personnel. → on ne compte
#      que les auteurs dont le nom ne finit pas par `[bot]`.
#   3. LA FENÊTRE. Les PR de toute une vie récompensent l'ancienneté, pas le
#      travail actuel. → commits des 90 derniers jours.
#
# Aucun de ces nombres n'est recopié : tous viennent de l'API, à la commande.
#
# Notes de terrain (payées en échecs, gardées pour la prochaine fois)
# ------------------------------------------------------------------
# · `search/issues` est plafonnée à ~30 appels/min et rend un **422 trompeur**
#   au lieu d'un 429. On compte donc les PR par l'en-tête `Link` de
#   `repos/{}/pulls?state=all&per_page=1`, qui n'a pas cette limite ;
# · le parallélisme + `2>/dev/null` PERD des résultats en silence. Ici tout est
#   séquentiel et chaque échec est nommé sur stderr.

set -uo pipefail

REQUETE="${1:-}"
PLAFOND_ETOILES="${2:-8000}"
SORTIE="${3:-/tmp/gisements.tsv}"
DEPUIS="${DEPUIS:-$(python3 -c 'import datetime;print((datetime.date.today()-datetime.timedelta(days=90)).isoformat())')}"

if [ -z "$REQUETE" ]; then
  cat >&2 <<'USAGE'
usage: gisements.sh "<requête GitHub>" [plafond-étoiles] [fichier-sortie]

  Le PLAFOND est le point du script : on ne regarde QUE sous ce seuil
  d'étoiles. Au-dessus, ce n'est plus un gisement, c'est une vitrine.

exemples :
  gisements.sh "topic:ai-agent language:typescript pushed:>2026-06-01"
  gisements.sh "coding agent harness in:name,description pushed:>2026-06-01" 3000
USAGE
  exit 64
fi

echo "▸ requête   : $REQUETE" >&2
echo "▸ plafond   : < $PLAFOND_ETOILES étoiles (au-delà, c'est une vitrine)" >&2

CANDIDATS=$(gh api -X GET search/repositories \
  -f q="$REQUETE stars:<$PLAFOND_ETOILES fork:false" -f sort=stars -f per_page=100 \
  --jq '.items[] | "\(.full_name)\t\(.stargazers_count)\t\(.language // "-")\t\(.pushed_at[:10])"' 2>/dev/null)

if [ -z "$CANDIDATS" ]; then
  echo "✗ aucun candidat — requête trop étroite, ou quota de recherche épuisé." >&2
  echo "  (la recherche GitHub est plafonnée ; réessayer dans une minute)" >&2
  exit 1
fi

N=$(printf '%s\n' "$CANDIDATS" | wc -l | tr -d ' ')
echo "▸ candidats : $N" >&2

: > "$SORTIE"
ECHECS=0
I=0

while IFS=$'\t' read -r DEPOT ETOILES LANGUE POUSSE; do
  I=$((I + 1))
  printf '\r  … %s/%s  %-42s' "$I" "$N" "${DEPOT:0:42}" >&2

  # Piège 1 : le fork hérite de tout. On revérifie même si la requête le filtre.
  EST_FORK=$(gh api "repos/$DEPOT" --jq '.fork' 2>/dev/null)
  if [ "$EST_FORK" != "false" ]; then continue; fi

  # Pièges 2 et 3 : commits d'HUMAINS sur 90 jours, jamais les PR d'une vie.
  JOURNAL=$(gh api "repos/$DEPOT/commits?since=$DEPUIS&per_page=100" \
            --jq '.[].commit.author.name' 2>/dev/null | grep -v '\[bot\]$')
  if [ -z "$JOURNAL" ]; then
    echo "" >&2; echo "  ✗ muet (aucun commit humain sur 90 j) : $DEPOT" >&2
    ECHECS=$((ECHECS + 1)); continue
  fi
  COMMITS=$(printf '%s\n' "$JOURNAL" | wc -l | tr -d ' ')
  CONTRIB=$(printf '%s\n' "$JOURNAL" | sort -u | wc -l | tr -d ' ')
  PR=$COMMITS

  # Un auteur humain distinct pèse 10 : rassembler des gens est plus dur que
  # pousser des commits, et c'est le signal qu'un bot ne sait pas imiter.
  SUBSTANCE=$((COMMITS + CONTRIB * 10))
  GISEMENT=$(python3 -c "print(round($SUBSTANCE / ($ETOILES + 1), 2))" 2>/dev/null || echo 0)

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$GISEMENT" "$SUBSTANCE" "$ETOILES" "$PR" "$CONTRIB" "$LANGUE" "$POUSSE" "$DEPOT" >> "$SORTIE"
done <<< "$CANDIDATS"

echo "" >&2
sort -rn -o "$SORTIE" "$SORTIE"

echo "▸ mesurés   : $(wc -l < "$SORTIE" | tr -d ' ') · ÉCHECS : $ECHECS" >&2
[ "$ECHECS" -gt 0 ] && echo "  ↳ les échecs ci-dessus sont NOMMÉS, pas avalés." >&2

printf '\n%8s %9s %7s %8s %7s  %s\n' "GISEMENT" "substance" "★" "commits" "humains" "dépôt"
head -25 "$SORTIE" | awk -F'\t' '{printf "%8s %9s %7s %6s %7s  %s  [%s, %s]\n", $1, $2, $3, $4, $5, $8, $6, $7}'
