#!/usr/bin/env bash
# Environnement de développement avec rechargement automatique :
# - base PostgreSQL (Docker Compose) ;
# - bucket simulé dans .local/bucket, compilé depuis ../content s'il manque ;
# - API relancée par watchexec à chaque modification de crates/ ou migrations/ ;
# - PWA servie par Vite, avec rechargement à chaud.
# Ctrl-C arrête l'API et la PWA ; la base reste démarrée (`docker compose stop`).
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
cd "$racine"


export DATABASE_URL="${DATABASE_URL:-postgres://etymo:etymo-dev@127.0.0.1:55432/etymo}"
export ETYMO_CATALOGUE_URL="file://$racine/.local/bucket"
export ETYMO_CLE_SIGNATURE_SESSION="${ETYMO_CLE_SIGNATURE_SESSION:-developpement-local-uniquement-0123456789}"
export ETYMO_ORIGINES_PWA="${ETYMO_ORIGINES_PWA:-http://localhost:5173}"
# Relecture rapide de l'index : une nouvelle parution locale se voit en 5 s.
export ETYMO_RELECTURE_CATALOGUE_S="${ETYMO_RELECTURE_CATALOGUE_S:-5}"
export ETYMO_RELECTURE_CATALOGUE_S=60
# Requêtes vérifiées contre la base locale : une nouvelle requête compile sans `cargo sqlx prepare`.
export SQLX_OFFLINE="${SQLX_OFFLINE:-false}"
export PATH="$HOME/.cargo/bin:$PATH"
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
  "$contenu/.venv/bin/etymo-contenu" compiler --racine "$contenu" --essai \
    --sortie .local/bucket/staging --version essai-local
  ETYMO_S3_POINT="file://$racine/.local/bucket" \
    cargo run -q -p etymo-api -- publier-fascicules --simuler-le "${ETYMO_SIMULER_LE:-2100-01-01T00:00:00Z}"
fi

[ -d web/node_modules ] || (cd web && npm ci)

pids=()
arreter() { kill "${pids[@]}" 2>/dev/null || true; }
trap arreter EXIT INT TERM

watchexec --restart --watch crates --watch migrations --watch Cargo.toml --exts rs,sql,toml \
  --debounce 500ms -- 'sqlx migrate run --source migrations && cargo run -q -p etymo-api' &
pids+=($!)

(cd web && npx vite --port 5173 --strictPort) &
pids+=($!)

echo "API : http://localhost:8080 · PWA : http://localhost:5173"
wait
