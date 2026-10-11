#!/usr/bin/env bash
# Mesure le démarrage à froid de l'API : du lancement du processus à la première
# réponse 200 de GET /sante (J8, App#30 : sous 1 s au p95). Lance l'API N fois
# (20 par défaut) contre la base et le catalogue indiqués, puis affiche p50 et p95.
#
# Usage : scripts/demarrage-a-froid.sh [N]
#   DATABASE_URL, ETYMO_CATALOGUE_URL, ETYMO_CLE_SIGNATURE_SESSION, ETYMO_ORIGINES_PWA
#   suivent l'environnement ; PORT (défaut 18080). Un binaire `release` donne la
#   mesure utile : `cargo build --release -p etymo-api`.
#
# Cette mesure couvre le démarrage du processus (connexion à la base, lecture
# du catalogue, écoute). Le démarrage d'un conteneur Scaleway à froid, lui, se
# mesure en hors-prod : relever l'écart entre la requête et la réponse après
# une période sans trafic.
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
n="${1:-20}"
port="${PORT:-18080}"
binaire="${ETYMO_BINAIRE:-$racine/target/release/etymo-api}"
[ -x "$binaire" ] || binaire="$racine/target/debug/etymo-api"
[ -x "$binaire" ] || { echo "Binaire absent : cargo build --release -p etymo-api" >&2; exit 1; }

export PORT="$port"
export ETYMO_CLE_SIGNATURE_SESSION="${ETYMO_CLE_SIGNATURE_SESSION:-mesure-locale-uniquement-0123456789abcdef}"
export ETYMO_ORIGINES_PWA="${ETYMO_ORIGINES_PWA:-http://localhost:5173}"
export ETYMO_CATALOGUE_URL="${ETYMO_CATALOGUE_URL:-file://$racine/.local/bucket}"
: "${DATABASE_URL:?DATABASE_URL requis}"

mesures=()
for _ in $(seq "$n"); do
  debut=$(python3 -c 'import time; print(time.time())')
  "$binaire" >/dev/null 2>&1 &
  pid=$!
  until curl -fs "http://127.0.0.1:$port/sante" >/dev/null 2>&1; do
    kill -0 "$pid" 2>/dev/null || { echo "L'API s'est arrêtée au démarrage" >&2; exit 1; }
    sleep 0.01
  done
  fin=$(python3 -c 'import time; print(time.time())')
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  mesures+=("$(python3 -c "print(f'{($fin - $debut) * 1000:.0f}')")")
done

printf '%s\n' "${mesures[@]}" | sort -n | python3 -c '
import sys, math
v = [int(x) for x in sys.stdin.read().split()]
p = lambda q: v[min(len(v) - 1, math.ceil(q * len(v)) - 1)]
print(f"{len(v)} démarrages : p50 {p(0.5)} ms, p95 {p(0.95)} ms, max {v[-1]} ms")
'
