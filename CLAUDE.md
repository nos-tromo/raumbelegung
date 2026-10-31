# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Room booking web app ("Raumbelegung"): accounts with email verification, multiple calendars with per-calendar roles (owner / editor / viewer), recurring bookings with conflict checks. It was ported from the single-file artifact `Raumbelegung.html`, which stays in the repo as the reference for the domain logic.

Docs, UI text, error messages and commit bodies are German; code, identifiers and code comments are English. Commits follow Conventional Commits.

Key docs (read before larger changes):
- `docs/ARCHITEKTUR.md`: tech stack, data model, permission matrix, full API contract
- `docs/LOKAL-TESTEN.md`: manual test checklist, local production-stack test
- `deploy/server-setup.md`: server setup and operations

## Commands

Everything goes through the `Makefile` (`make` alone prints help). Prerequisites: Docker, uv, Node.js 26, make.

```bash
make install          # create backend/.env from backend/.env.example, install Python + npm deps
make dev              # PostgreSQL + Mailpit (Docker), migrate, backend :8000 + frontend :5173 with hot reload
make test             # pytest + vitest (also: make test-backend / make test-frontend)
make test-pg          # backend tests against the dev PostgreSQL instead of SQLite
make verify           # CI lint gate: ruff check, ruff format --check, mypy, eslint, frontend build
make format           # ruff --fix + ruff format + prettier
make migration MSG="short description"   # alembic autogenerate from models
make migrate          # alembic upgrade head
```

Dev URLs: app http://localhost:5173, API docs http://localhost:8000/api/v1/docs, mails (verify/reset/invite) in Mailpit http://localhost:8025. Vite proxies `/api` to `:8000`. If `backend/.env` has a `sqlite` `DATABASE_URL`, `make dev` skips Docker.

Single tests:

```bash
cd backend && uv run --locked pytest tests/test_bookings.py::test_name -q
cd frontend && TZ=Europe/Berlin npx vitest run src/lib/recurrence.test.ts -t "name"
```

Frontend tests must run with `TZ=Europe/Berlin` (`npm test` sets it). `npm run test:tz` reruns `src/lib` in UTC, America/Los_Angeles and Pacific/Kiritimati to catch timezone bugs in date logic; `make test-frontend` runs it, CI does not.

## Architecture

```
Browser → Caddy (:443) ── /       → static SPA build (fallback index.html)
                       └─ /api/*  → FastAPI backend :8000 → PostgreSQL, SMTP
```

Same origin in production and dev (via Vite proxy), so there is no CORS. Session auth uses an `HttpOnly` cookie `rb_session`.

### Recurrence logic exists twice and must stay in sync

- `frontend/src/lib/recurrence.ts`: live conflict check in the booking form
- `backend/app/domain/recurrence.py`: authoritative check on save (730-day horizon)
- `shared/recurrence-cases.json`: expected values generated from the original JavaScript in `Raumbelegung.html`. Both `backend/tests/test_recurrence.py` and `frontend/src/lib/recurrence.test.ts` load this file.

Any change to series rules (`rec`: `none`, `daily`, `weekdays`, `weekly`, `monthly`, `monthlyLast`) must update both ports and the fixtures. Dates and times are timezone-less local values; each calendar has a `timezone` used only to compute "today" on the server.

### Backend (`backend/app/`)

- `main.py` builds the app: `CSRFHeaderMiddleware` and `RateLimitMiddleware`, plus all routers under `/api/v1`. It refuses to start if `COOKIE_SECURE=true` (= production) and `SECRET_KEY` is the default or shorter than 32 chars.
- **CSRF**: every POST/PUT/PATCH/DELETE under `/api` needs the `X-Requested-With: XMLHttpRequest` header (`csrf.py`). Test clients in `conftest.py` set it by default; new frontend fetches go through `frontend/src/lib/api.ts`, which sends it.
- **Auth** is fastapi-users (`auth/users.py`) with cookie transport and a DB token strategy, so sessions can be revoked server-side. Its routes are generated, which is why rate limits are a path-matching ASGI middleware (`ratelimit.py`, a `LIMITS` dict) instead of decorators. The invitation limit is per user (`INVITE_LIMIT`, enforced via `enforce_user_limit` in the invitations router).
- **Permissions**: route dependency `require_role(Role.x)` in `deps.py` returns a `CalendarAccess`. Non-members get **404, not 403**, so calendar IDs cannot be probed; too-low role gives `403 FORBIDDEN`. The last owner of a calendar cannot be demoted, leave, or delete their account (`409 LAST_OWNER`).
- **Errors** are `{"detail": "CODE"}` or `{"detail": {"code": ..., ...}}`, with machine-readable codes the frontend maps to German text. Keep new errors in that shape and document them in `docs/ARCHITEKTUR.md` §5.
- **Booking creation** locks the calendar row (`with_for_update`) before the conflict check so concurrent creates serialize (no-op on SQLite). A conflict without `force` returns `409 BOOKING_CONFLICT` with the conflicts.
- **Mail** (`auth/mailer.py`): Jinja2 `.txt` + `.html` templates in `auth/templates/`, sent via `BackgroundTasks`. `MAIL_BACKEND` is `smtp` | `console` | `memory`. Tests use `memory` and read `mailer.outbox`.
- **DB**: async SQLAlchemy 2.0 (pinned `<2.1` by fastapi-users-db-sqlalchemy) with a naming convention in `db.py`. Alembic migrations live in `alembic/versions/`. `tests/test_migrations.py` runs `alembic check`, so a model change without a matching migration fails the tests. The production backend container runs `alembic upgrade head` on start.
- Settings come from env / `backend/.env` via pydantic-settings (`config.py`).
- Tooling: ruff (line length 100, includes the `S` security rules; German typography RUF001-003 is allowed), mypy `--strict` on `app/`.

### Backend tests

`tests/conftest.py` sets the env **before** importing the app (temp SQLite DB, memory mail, rate limits off). Set `TEST_DATABASE_URL` to use PostgreSQL. The schema is dropped and recreated for every test. Helpers: `make_user(email, verified=True)` returns a logged-in client, plus `create_calendar`, `add_member` (full invite → accept flow via outbox token), `booking(**overrides)`, `last_mail`, `token_from`.

### Frontend (`frontend/src/`)

React 19 + TypeScript 6 + Vite 8 SPA, React Router 8 in data mode (`router.tsx`), TanStack Query for server state (`lib/queries.ts`, query keys in `qk`; mutations invalidate them), react-hook-form + zod (`lib/schemas.ts`). `lib/api.ts` is the only fetch layer and throws `ApiError` with `.code` and `.retryAfter`. Route guards are in `auth/guards.tsx`; unverified users see only a "confirm your email" notice on `/app` routes. Plain CSS with design tokens from the artifact; fonts are self-hosted via `@fontsource` (no Google Fonts CDN, for GDPR reasons). Don't add external CDNs, analytics, or extra cookies: the privacy policy depends on there being none.

`legal/site.ts` holds placeholder Impressum/Datenschutz data that the operator must fill in before go-live.

TypeScript 7 is blocked until typescript-eslint supports it.

## Deployment

`deploy/docker-compose.prod.yml` runs Caddy (`web`, which serves the frontend build from `deploy/web.Dockerfile`), backend, PostgreSQL and an on-demand `backup` service (pg_dump → restic → Hetzner Object Storage). CI (`.github/workflows/ci.yml`) runs the same checks as `make verify` + `make test`. `deploy.yml` builds images to GHCR and deploys over SSH. The same Makefile works on the server (`make pull`, `make up`, `make backup`, `make restore`), and its production targets need `deploy/.env` (template: root `.env.example`).
