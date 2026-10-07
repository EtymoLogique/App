# syntax=docker/dockerfile:1
# Image unique de l'API et des tâches planifiées (ADR 0024) : `etymo-api`
# sert l'API par défaut ; `etymo-api publier-fascicules` et `etymo-api purger`
# sont lancées par les Serverless Jobs du dépôt Infra.

FROM rust:1.98-bookworm AS construction
WORKDIR /src
# Requêtes SQL vérifiées à la compilation, sans base : données de .sqlx/.
ENV SQLX_OFFLINE=true
COPY Cargo.toml Cargo.lock ./
COPY .sqlx .sqlx
COPY migrations migrations
COPY crates crates
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p etymo-api \
    && cp target/release/etymo-api /etymo-api

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=construction /etymo-api /usr/local/bin/etymo-api
# Commit de l'image, exposé par /sante pour vérifier un déploiement.
ARG REVISION=
ENV ETYMO_REVISION=$REVISION
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/etymo-api"]
