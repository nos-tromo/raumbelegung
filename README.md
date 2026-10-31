# Raumbelegung

Web-App zur Belegung von Räumen: Registrierung mit E-Mail-Aktivierung, Passwort-Reset, mehrere Kalender mit Rollen (Owner, Editor, Viewer), Serientermine mit Konfliktprüfung über 24 Monate.

Entstanden aus dem Einzel-Artefakt [`Raumbelegung.html`](Raumbelegung.html). Es bleibt als Referenz im Repo, die Fachlogik ist 1:1 übernommen.

**Architektur, Datenmodell und API-Vertrag:** [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md)
**Server einrichten und deployen:** [`deploy/server-setup.md`](deploy/server-setup.md)
**Lokal testen (Schritt für Schritt, mit Checkliste):** [`docs/LOKAL-TESTEN.md`](docs/LOKAL-TESTEN.md)

## Aufbau

| Ordner | Inhalt |
|---|---|
| `frontend/` | React + TypeScript + Vite (SPA) |
| `backend/` | FastAPI, SQLAlchemy, Alembic, fastapi-users |
| `shared/recurrence-cases.json` | gemeinsame Testfälle für die Serienlogik (Frontend und Backend) |
| `deploy/` | Produktion: Compose-Datei, Caddyfile, Frontend-Image, Backup |
| `docker-compose.yml` | Entwicklung: PostgreSQL und Mailpit |
| `Makefile` | alle Befehle für Entwicklung, Tests und Betrieb (`make` zeigt die Hilfe) |
| `.github/workflows/` | CI (Lint, Tests, Build) und Deployment |

## Lokal entwickeln

Voraussetzungen: Docker, [uv](https://docs.astral.sh/uv/), Node.js 26 (LTS), make.

```bash
make install    # einmalig: backend/.env anlegen, Python- und npm-Pakete installieren
make dev        # PostgreSQL + Mailpit, Migrationen, Backend und Frontend mit Hot-Reload
```

App: http://localhost:5173 · API-Doku: http://localhost:8000/api/v1/docs · Aktivierungs-, Reset- und Einladungsmails: **Mailpit http://localhost:8025**. `Strg+C` beendet Backend und Frontend, `make down` stoppt die Container.

`make` ohne Argument listet alle Befehle: Tests und Checks, Migrationen, Produktions-Stack, Backup und Restore.

**Ohne Docker:** In `backend/.env` die SQLite-Zeile für `DATABASE_URL` aktivieren und `MAIL_BACKEND=console` setzen. `make dev` startet dann keine Container, die Mails stehen im Terminal.

## Tests und Checks

```bash
make test       # pytest + vitest wie in der CI, dazu die Serienlogik in weiteren Zeitzonen
make verify     # vor dem Push: Ruff, Mypy, ESLint, Build (Lint-Gate der CI)
make format     # Python- und Frontend-Code formatieren
```

Backend-Tests laufen standardmäßig gegen SQLite. `make test-pg` testet gegen das Dev-PostgreSQL; die Test-Datenbank wird dabei geleert.

### Serienlogik ändern

Die Regeln (`none`, `daily`, `weekdays`, `weekly`, `monthly`, `monthlyLast`) gibt es zweimal: `frontend/src/lib/recurrence.ts` für die Live-Prüfung und `backend/app/domain/recurrence.py`, das beim Speichern verbindlich entscheidet. Beide müssen alle Fälle in `shared/recurrence-cases.json` bestehen. Wer die Logik ändert, passt beide Ports an und ergänzt die Testfälle.

### Datenbank-Migration anlegen

```bash
make migration MSG="kurze beschreibung"   # neue Datei in backend/alembic/versions/, bitte prüfen
make migrate
```

In Produktion laufen Migrationen automatisch beim Start des Backend-Containers.

## Produktion

Kurzfassung (Details in [`deploy/server-setup.md`](deploy/server-setup.md)):

1. VPS in der EU (z. B. Hetzner, Standort DE) mit Docker; DNS auf den Server zeigen lassen
2. `deploy/`, `Makefile` und `.env.example` auf den Server kopieren, daraus `deploy/.env` ausfüllen
3. `make pull up`: Caddy holt das TLS-Zertifikat automatisch
4. GitHub-Secrets setzen. Danach baut jeder grüne Push auf `main` die Images und deployt sie

Auf dem Server gibt es außerdem `make backup`, `make snapshots`, `make restore`, `make logs` und `make health`.

Lokal mit Produktions-Setup testen (Caddy mit lokalem Zertifikat auf https://localhost): Abschnitt 7 in [`docs/LOKAL-TESTEN.md`](docs/LOKAL-TESTEN.md).

## Vor dem Go-live

- Impressum und Datenschutzerklärung in `frontend/src/legal/` ausfüllen und rechtlich prüfen lassen. Es sind **Vorlagen**, keine Rechtsberatung
- AV-Verträge mit Hoster und Mailanbieter abschließen
- SPF, DKIM und DMARC für die Absenderdomain setzen
- Backup **und** Restore einmal testen

Die vollständige Checkliste steht am Ende von [`deploy/server-setup.md`](deploy/server-setup.md).
