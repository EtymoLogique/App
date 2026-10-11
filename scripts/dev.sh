#!/usr/bin/env bash
# Environnement de développement avec rechargement automatique :
# - base PostgreSQL (Docker Compose) ;
# - bucket simulé dans .local/bucket, compilé depuis ../content s'il manque ;
# - API relancée par watchexec à chaque modification de crates/ ou migrations/ ;
# - PWA servie par Vite, avec rechargement à chaud.
# Ctrl-C arrête l'API et la PWA ; la base reste démarrée (`docker compose stop`).
# Plusieurs instances peuvent tourner en parallèle : les ports 8080 (API) et 5173 (PWA)
# sont incrémentés tant qu'ils sont occupés. Le PID de chaque instance est écrit dans
# running_instances/ ; `./dev.sh stopall` les arrête toutes.
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
cd "$racine"

instances="$racine/running_instances"

# Tue un processus et tous ses descendants.
tuer_arbre() {
  local enfant
  for enfant in $(pgrep -P "$1" 2>/dev/null); do tuer_arbre "$enfant"; done
  kill "$1" 2>/dev/null || true
}

if [ "${1:-}" = stopall ]; then
  for f in "$instances"/*.pid; do
    [ -e "$f" ] || continue
    tuer_arbre "$(cat "$f")"
    rm -f "$f"
    echo "Arrêté : $(basename "$f" .pid)"
  done
  exit 0
fi

# Premier port libre (sans écouteur) à partir de $1.
port_libre() {
  local p=$1
  while lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; do p=$((p + 1)); done
  echo "$p"
}
port_api=$(port_libre 8080)
port_pwa=$(port_libre 5173)
[ "$port_api" != "$port_pwa" ] || port_pwa=$(port_libre $((port_pwa + 1)))

export DATABASE_URL="${DATABASE_URL:-postgres://etymo:etymo-dev@127.0.0.1:55432/etymo}"
export ETYMO_CATALOGUE_URL="file://$racine/.local/bucket"
export ETYMO_CLE_SIGNATURE_SESSION="${ETYMO_CLE_SIGNATURE_SESSION:-developpement-local-uniquement-0123456789}"
export ETYMO_ORIGINES_PWA="${ETYMO_ORIGINES_PWA:-http://localhost:$port_pwa}"
export PORT="$port_api"
# Prioritaires sur web/.env.development : la PWA vise l'API et le catalogue de cette instance.
export VITE_URL_API="http://localhost:$port_api"
export VITE_URL_CATALOGUE="http://localhost:$port_pwa/catalogue"
# Relecture rapide de l'index : une nouvelle parution locale se voit en 5 s.
export ETYMO_RELECTURE_CATALOGUE_S="${ETYMO_RELECTURE_CATALOGUE_S:-5}"
export ETYMO_RELECTURE_CATALOGUE_S=60
# Plis
export ETYMO_RECHARGE_S=60
# Requêtes vérifiées contre la base locale : une nouvelle requête compile sans `cargo sqlx prepare`.
export SQLX_OFFLINE="${SQLX_OFFLINE:-false}"
export PATH="$HOME/.cargo/bin:$PATH"
# Hors production : ouvre POST /dev/reset et le bouton « Réinitialiser » des Réglages.
export ETYMO_REINITIALISATION="${ETYMO_REINITIALISATION:-true}"
export RUST_LOG="${RUST_LOG:-info}"

for outil in docker cargo npm watchexec sqlx; do
  command -v "$outil" >/dev/null || {
    echo "Outil manquant : $outil (brew install watchexec ; cargo install sqlx-cli --version 0.8.6 --no-default-features --features postgres,rustls)" >&2
    exit 1
  }
done

docker compose up -d --wait
sqlx migrate run --source migrations

if [ ! -f .local/bucket/public/index.json ]; then
  contenu="${ETYMO_CONTENU:-$racine/../content}"
  echo "Compilation du catalogue d'essai depuis $contenu…"
  cargo run -q --release --manifest-path "$contenu/outils/Cargo.toml" -- compiler --racine "$contenu" --essai \
    --sortie .local/bucket/staging --version essai-local
  ETYMO_S3_POINT="file://$racine/.local/bucket" \
    cargo run -q -p etymo-api -- publier-fascicules --simuler-le "${ETYMO_SIMULER_LE:-2100-01-01T00:00:00Z}"
fi

[ -d web/node_modules ] || (cd web && npm ci)

mkdir -p "$instances"
fichier_pid="$instances/$port_pwa.pid"
echo $$ >"$fichier_pid"
pids=()
arreter() { rm -f "$fichier_pid"; kill "${pids[@]}" 2>/dev/null || true; }
trap arreter EXIT INT TERM

watchexec --restart --watch crates --watch migrations --watch Cargo.toml --exts rs,sql,toml \
  --debounce 500ms -- 'sqlx migrate run --source migrations && cargo run -q -p etymo-api' &
pids+=($!)

(cd web && npx vite --port "$port_pwa" --strictPort) &
pids+=($!)

echo "API : http://localhost:$port_api · PWA : http://localhost:$port_pwa"
wait
