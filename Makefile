# Raumbelegung – Befehle für Entwicklung, Tests und Betrieb.
#
# Ohne Argument zeigt `make` die Hilfe. Das Makefile funktioniert an zwei Orten:
#   - im Repo: Entwicklung mit Hot-Reload, Tests und Checks wie in der CI,
#     lokaler Produktionstest (docs/LOKAL-TESTEN.md)
#   - auf dem Server in /opt/raumbelegung neben deploy/: Update, Backup,
#     Restore, Logs (deploy/server-setup.md)
# Die Produktionsziele arbeiten mit deploy/docker-compose.prod.yml und brauchen
# deploy/.env. Läuft mit GNU Make 3.81 (macOS) und 4.x (Linux).

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# Dev-Stack: PostgreSQL + Mailpit. Backend und Frontend laufen nativ.
COMPOSE_DEV := docker compose -f docker-compose.yml
# Produktions-Stack: Caddy (web), Backend, PostgreSQL, Backup. Überschreibbar,
# z. B. um zusätzlich eine Override-Datei einzubinden.
COMPOSE_PROD ?= docker compose -f deploy/docker-compose.prod.yml

# Was gibt es hier? Im Repo liegt backend/, auf dem Server nur deploy/.
# Ohne deploy/.env lässt sich der Produktions-Stack nicht ansprechen.
IN_REPO   := $(wildcard backend/pyproject.toml)
HAVE_DEV  := $(wildcard docker-compose.yml)
HAVE_PROD := $(wildcard deploy/.env)

# Steht in backend/.env eine SQLite-URL, braucht die Entwicklung keine Container.
DEV_SQLITE := $(shell grep -qs '^DATABASE_URL=sqlite' backend/.env && echo yes)
DEV_DB     := $(if $(DEV_SQLITE),,services)

# Test-Datenbank für `make test-pg` im Dev-PostgreSQL.
TEST_DB           := raumbelegung_test
TEST_DATABASE_URL := postgresql+asyncpg://raumbelegung:raumbelegung@localhost:5432/$(TEST_DB)

# npm schreibt diese Datei bei jeder Installation neu. Als Make-Ziel läuft
# `npm ci` damit nur, wenn sich package.json oder package-lock.json geändert haben.
FRONTEND_DEPS := frontend/node_modules/.package-lock.json

# `uv run --locked` synchronisiert die Python-Pakete selbst und bricht ab, wenn
# pyproject.toml und uv.lock nicht zusammenpassen.
UV := cd backend && uv run --locked

ifneq ($(filter migration,$(MAKECMDGOALS)),)
ifeq ($(strip $(MSG)),)
$(error MSG fehlt: make migration MSG="kurze beschreibung")
endif
endif

.PHONY: help install dev services backend frontend migrate migration nuke \
        test test-backend test-frontend test-pg verify format \
        prod-env build pull up restart logs backup snapshots restore \
        ps health stop down

help:
	@echo "Raumbelegung – Entwicklung, Tests und Betrieb."
	@echo
ifneq ($(IN_REPO),)
	@echo "Einrichtung:"
	@echo "  make install         backend/.env anlegen (falls sie fehlt), Python- und npm-Pakete"
	@echo
	@echo "Entwicklung (App http://localhost:5173, Mails http://localhost:8025):"
	@echo "  make dev             DB + Mailpit starten, migrieren, Backend und Frontend mit"
	@echo "                       Hot-Reload in einem Terminal; Strg+C beendet beide"
	@echo "  make services        nur PostgreSQL + Mailpit starten (Docker, im Hintergrund)"
	@echo "  make backend         nur das Backend (Port 8000, API-Doku unter /api/v1/docs)"
	@echo "  make frontend        nur das Frontend (Port 5173)"
	@echo "  make migrate         Datenbank-Migrationen anwenden"
	@echo "  make migration MSG=\"kurze beschreibung\""
	@echo "                       neue Migration aus den Modellen erzeugen"
	@echo "  make nuke            Dev-Datenbank und Mails LÖSCHEN (fragt nach)"
	@echo
	@echo "Tests und Checks:"
	@echo "  make test            pytest + vitest (test-backend / test-frontend: eine Hälfte)"
	@echo "  make test-pg         Backend-Tests gegen PostgreSQL statt SQLite"
	@echo "  make verify          vor dem Push: Ruff, Mypy, ESLint, Build (Lint-Gate der CI)"
	@echo "  make format          Python- und Frontend-Code formatieren"
	@echo
endif
	@echo "Produktions-Stack (Caddy + Backend + PostgreSQL, braucht deploy/.env):"
	@echo "  make build           Images bauen (lokaler Test), danach make up"
	@echo "  make pull            neue Images aus der Registry holen (Server), danach make up"
	@echo "  make up              starten, im Hintergrund, baut nie"
	@echo "  make restart [S=…]   Container neu starten, z. B. S=backend"
	@echo "  make logs [S=…]      Logs verfolgen, optional nur ein Dienst"
	@echo "  make backup          Backup jetzt (pg_dump → restic)"
	@echo "  make snapshots       vorhandene Backups auflisten"
	@echo "  make restore [SNAPSHOT=…]"
	@echo "                       Backup zurückspielen, Standard: neuestes (fragt nach)"
	@echo
	@echo "Status und Stoppen (alle Container dieses Ordners):"
	@echo "  make ps              Container-Status"
	@echo "  make health          Zustand der Dienste$(if $(IN_REPO), und des Dev-Backends)"
	@echo "  make stop            Container anhalten"
	@echo "  make down            Container stoppen und entfernen (Daten bleiben)"
	@echo
ifneq ($(IN_REPO),)
	@echo "Anleitungen: docs/LOKAL-TESTEN.md, deploy/server-setup.md"
else
	@echo "Anleitung: deploy/server-setup.md"
endif

# --- Einrichtung -------------------------------------------------------------

# Einmalig nach dem Klonen und nach Updates der Abhängigkeiten.
install: backend/.env $(FRONTEND_DEPS)
	cd backend && uv sync --locked

# Dev-Konfiguration aus der Vorlage. Absichtlich ohne Abhängigkeit auf die
# Vorlage: eine vorhandene backend/.env wird nie überschrieben.
backend/.env:
	cp backend/.env.example $@
	@echo ">> backend/.env aus backend/.env.example angelegt"

$(FRONTEND_DEPS): frontend/package.json frontend/package-lock.json
	cd frontend && npm ci --no-audit --no-fund

# --- Entwicklung -------------------------------------------------------------

# Alles in einem Terminal: Container (außer bei SQLite), Migrationen, dann
# Backend und Frontend parallel mit Hot-Reload. Strg+C beendet beide;
# PostgreSQL und Mailpit laufen weiter (`make down` stoppt sie).
dev: migrate $(FRONTEND_DEPS)
	@echo ">> App: http://localhost:5173 · $(if $(DEV_SQLITE),Mails im Backend-Log,Mails: http://localhost:8025) · API-Doku: http://localhost:8000/api/v1/docs"
	@$(MAKE) --no-print-directory -j2 backend frontend

# PostgreSQL und Mailpit im Hintergrund; wartet, bis beide bereit sind.
services:
	$(COMPOSE_DEV) up -d --wait

# Nur das Backend. Lädt bei Code-Änderungen neu, bei Änderungen an
# backend/.env dagegen nicht: dann neu starten.
backend: backend/.env
	$(UV) uvicorn app.main:app --reload

# Nur das Frontend. Leitet /api an das Backend auf Port 8000 weiter.
frontend: $(FRONTEND_DEPS)
	cd frontend && npm run dev

# Datenbank auf den neuesten Stand bringen (startet PostgreSQL bei Bedarf).
migrate: backend/.env $(DEV_DB)
	$(UV) alembic upgrade head

# Neue Migration aus den SQLAlchemy-Modellen. Die erzeugte Datei in
# backend/alembic/versions/ prüfen, dann `make migrate`.
migration: migrate
	$(UV) alembic revision --autogenerate -m "$(MSG)"

# Dev-Daten löschen: PostgreSQL-Volume und Mailpit-Postfach, bei SQLite
# backend/dev.db. Berührt nie den Produktions-Stack. Danach legt `make dev`
# (oder `make migrate`) eine leere Datenbank an.
nuke:
	@test -f docker-compose.yml || { echo "make nuke gibt es nur im Repo (Dev-Daten)."; exit 1; }
ifeq ($(DEV_SQLITE),yes)
	@echo "Das löscht die SQLite-Datenbank backend/dev.db."
else
	@echo "Das löscht die Dev-Datenbank (PostgreSQL-Volume) und alle Mails in Mailpit."
endif
	@read -r -p "Zum Bestätigen 'nuke' eintippen: " confirm && [ "$$confirm" = nuke ] \
	  || { echo "Abgebrochen."; exit 1; }
ifeq ($(DEV_SQLITE),yes)
	rm -f backend/dev.db
else
	$(COMPOSE_DEV) down -v
endif

# --- Tests und Checks --------------------------------------------------------

# Beide Testsuiten, wie in der CI.
test: test-backend test-frontend

# pytest gegen eine temporäre SQLite-Datei.
test-backend:
	$(UV) pytest -q

# Vitest in Europe/Berlin wie in der CI, dazu die Serienlogik in drei weiteren
# Zeitzonen (die laufen in der CI nicht).
test-frontend: $(FRONTEND_DEPS)
	cd frontend && npm test
	cd frontend && npm run test:tz

# Backend-Tests gegen das Dev-PostgreSQL. Legt die Test-Datenbank bei Bedarf
# an; die Tests leeren sie bei jedem Lauf.
test-pg: services
	@$(COMPOSE_DEV) exec -T db psql -U raumbelegung -d postgres -tAc \
	  "SELECT 1 FROM pg_database WHERE datname = '$(TEST_DB)'" | grep -q 1 \
	  || $(COMPOSE_DEV) exec -T db createdb -U raumbelegung $(TEST_DB)
	cd backend && TEST_DATABASE_URL=$(TEST_DATABASE_URL) uv run --locked pytest -q

# Vor dem Push: dieselben Lint-, Typ- und Build-Schritte wie in der CI.
# Die Tests laufen getrennt mit `make test`.
verify: $(FRONTEND_DEPS)
	$(UV) ruff check .
	$(UV) ruff format --check .
	$(UV) mypy app
	cd frontend && npm run lint
	cd frontend && npm run build

# Formatieren und einfache Lint-Funde automatisch beheben.
format: $(FRONTEND_DEPS)
	$(UV) ruff check --fix .
	$(UV) ruff format .
	cd frontend && npm run format -- --log-level warn

# --- Produktions-Stack -------------------------------------------------------

# Die Produktionsziele brauchen deploy/.env.
prod-env:
	@test -f deploy/.env || { \
	  echo "deploy/.env fehlt. Server: deploy/server-setup.md, lokaler Test: docs/LOKAL-TESTEN.md (Abschnitt 7)."; \
	  exit 1; }

# Images bauen (lokaler Test). Auf dem Server kommen sie aus der Registry.
build: prod-env
	$(COMPOSE_PROD) build

# Neue Images aus der Registry holen (Server). Nach einem Push auf main
# erledigt das der Deploy-Workflow automatisch.
pull: prod-env
	$(COMPOSE_PROD) pull

# Starten wie in der Produktion: im Hintergrund, ohne zu bauen. Fehlt ein
# Image, vorher `make build` (lokal) oder `make pull` (Server).
up: prod-env
	$(COMPOSE_PROD) up -d --no-build --remove-orphans

# Container neu starten, ohne sie neu anzulegen (setzt z. B. die Rate-Limits
# zurück). Änderungen an deploy/.env übernimmt dagegen nur `make up`.
restart: prod-env
	$(COMPOSE_PROD) restart $(S)

# Logs verfolgen, optional nur ein Dienst: make logs S=backend
logs: prod-env
	$(COMPOSE_PROD) logs -f --tail=200 $(S)

# Backup jetzt: pg_dump → restic, Ziel und Passwort aus deploy/.env. Auf dem
# Server läuft es zusätzlich nachts per Cron (deploy/server-setup.md).
backup: prod-env
	$(COMPOSE_PROD) --profile backup run --rm backup

# Vorhandene Backups auflisten, z. B. für make restore SNAPSHOT=<ID>.
snapshots: prod-env
	$(COMPOSE_PROD) --profile backup run --rm --entrypoint restic backup snapshots --tag db

# Backup zurückspielen. Überschreibt die Datenbank! Hält dafür das Backend an
# und startet es danach wieder; ohne SNAPSHOT das neueste Backup. Scheitert
# der Restore, bleibt das Backend gestoppt.
restore: prod-env
	@echo "Das überschreibt die Produktionsdatenbank mit dem Backup '$(or $(SNAPSHOT),latest)'."
	@read -r -p "Zum Bestätigen 'restore' eintippen: " confirm && [ "$$confirm" = restore ] \
	  || { echo "Abgebrochen."; exit 1; }
	$(COMPOSE_PROD) stop backend
	$(COMPOSE_PROD) --profile backup run --rm --entrypoint restore.sh backup $(SNAPSHOT)
	$(COMPOSE_PROD) start backend

# --- Status und Stoppen ------------------------------------------------------

# Container-Status aller Stacks, die es hier gibt.
ps:
ifneq ($(HAVE_DEV),)
	$(COMPOSE_DEV) ps
endif
ifneq ($(HAVE_PROD),)
	$(COMPOSE_PROD) ps
endif

# Zustand der Dienste laut Docker-Healthcheck, im Repo zusätzlich das native
# Dev-Backend auf Port 8000. Endet immer mit 0.
health:
ifneq ($(HAVE_DEV),)
	@echo "Entwicklung:"
	@if [ -n "$$($(COMPOSE_DEV) ps -q 2>/dev/null)" ]; then \
	  $(COMPOSE_DEV) ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' | sed 's/^/  /'; \
	else echo "  keine Container"; fi
	@curl -fsS --max-time 3 http://localhost:8000/api/v1/health >/dev/null 2>&1 \
	  && echo "  Backend (Port 8000): ok" || echo "  Backend (Port 8000): läuft nicht"
endif
ifneq ($(HAVE_PROD),)
	@echo "Produktion:"
	@if [ -n "$$($(COMPOSE_PROD) ps -q 2>/dev/null)" ]; then \
	  $(COMPOSE_PROD) ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' | sed 's/^/  /'; \
	else echo "  keine Container"; fi
endif

# Container anhalten, ohne sie zu entfernen.
stop:
ifneq ($(HAVE_DEV),)
	$(COMPOSE_DEV) stop
endif
ifneq ($(HAVE_PROD),)
	$(COMPOSE_PROD) stop
endif

# Container stoppen und entfernen. Volumes (Datenbank, Mails, Zertifikate) bleiben.
down:
ifneq ($(HAVE_DEV),)
	$(COMPOSE_DEV) down
endif
ifneq ($(HAVE_PROD),)
	$(COMPOSE_PROD) down
endif
