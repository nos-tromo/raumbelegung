# Raumbelegung – Architektur, Techstack und Infrastruktur

Dieses Dokument beschreibt, wie das Einzel-Artefakt `Raumbelegung.html` zu einer öffentlich erreichbaren, DSGVO-konformen Web-App wird: mit Registrierung, E-Mail-Aktivierung, Passwort-Reset, mehreren Kalendern (Räumen) und Rollen pro Kalender.

## 1. Ausgangslage

`Raumbelegung.html` enthält bereits die komplette Fachlogik:

- Buchung = `title`, `date` (erster Termin), `start`, `end`, `rec`, optional `until`
- Serienregeln `rec`: `none` (einmalig), `daily`, `weekdays` (Mo–Fr), `weekly` (gleicher Wochentag), `monthly` (n-ter Wochentag im Monat), `monthlyLast` (letzter Wochentag im Monat)
- Konfliktprüfung: eine neue Buchung wird über 730 Tage (24 Monate) gegen alle bestehenden Buchungen geprüft. Bei Überschneidung kann man „trotzdem speichern“.
- Ansichten: nächste 4 Wochen, Jahresansicht als Monats-Akkordeon, Liste aller Serien und anstehenden Einzeltermine

Es fehlen Benutzer, Rechte, ein Server und eine dauerhafte, gemeinsame Speicherung.

## 2. Techstack

| Schicht             | Wahl                                                                                                                                | Begründung                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Frontend            | React 19, TypeScript 6, Vite 8, React Router 8 (Data Mode), TanStack Query, react-hook-form + zod                                   | Statischer Build ohne Node-Server in Produktion. TypeScript 7 geht noch nicht, weil typescript-eslint < 6.1 verlangt |
| Styling             | Plain CSS mit den Design-Tokens aus dem Artefakt; Fonts selbst gehostet über `@fontsource/*`                                     | Google-Fonts-CDN ist in DE abmahnrelevant (LG München I, 20.01.2022)                                                |
| API                 | FastAPI (Python 3.13), Pydantic v2, Uvicorn                                                                                         | Typisiert, OpenAPI-Schema automatisch                                                                                |
| Auth                | fastapi-users (Cookie-Transport + Datenbank-Strategie), Argon2 über pwdlib                                                         | Registrierung, Verifizierung, Reset ohne extra Dienst; Sessions serverseitig widerrufbar                             |
| ORM / Migrationen   | SQLAlchemy 2.0 (async) + Alembic                                                                                                    | 2.1 erst, wenn fastapi-users-db-sqlalchemy es unterstützt (verlangt aktuell < 2.1)                                  |
| Datenbank           | PostgreSQL                                                                                                                          | Constraints, Transaktionen                                                                                           |
| E-Mail              | SMTP eines EU-Anbieters (z. B. Brevo, Mailjet) oder des Domain-Hosters; Jinja2-Templates; Versand über FastAPI `BackgroundTasks` | Keine Queue nötig                                                                                                   |
| Rate Limiting       | Limiter von slowapi, angebunden als kleine ASGI-Middleware (`app/ratelimit.py`)                                                   | Brute-Force- und Spam-Schutz. Die Auth-Routen erzeugt fastapi-users, deshalb keine Decorators                        |
| Reverse Proxy / TLS | Caddy (automatisches Let's Encrypt)                                                                                                 | Statische Auslieferung + `/api` auf derselben Origin, kein CORS                                                    |
| Tests               | pytest + httpx, Vitest, gemeinsame Recurrence-Fixtures                                                                              |                                                                                                                      |
| CI/CD               | GitHub Actions → GHCR → SSH-Deploy mit Docker Compose                                                                             |                                                                                                                      |
| Dev-Mail            | Mailpit (http://localhost:8025)                                                                                                     |                                                                                                                      |

Bewusst **nicht** enthalten: Redis, Celery, Kubernetes, Analytics, Cookie-Banner (es gibt nur ein technisch notwendiges Session-Cookie, § 25 Abs. 2 Nr. 2 TDDDG).

## 3. Architektur

```
Browser ──HTTPS──► Caddy (:443)
                    ├─ /            → statischer Frontend-Build (SPA-Fallback auf index.html)
                    └─ /api/*       → backend:8000 (FastAPI)
                                         ├─ PostgreSQL (Docker-Volume, nicht exponiert)
                                         └─ SMTP (EU-Mailanbieter)
backup (Host-Cron) ── pg_dump | restic ──► Hetzner Object Storage (S3, verschlüsselt)
```

### Recurrence-Logik

Die Fachlogik gibt es zweimal, beide Ports sind 1:1 aus dem Artefakt übernommen:

- `frontend/src/lib/recurrence.ts` für die Live-Prüfung im Formular
- `backend/app/domain/recurrence.py`, maßgeblich beim Speichern

`shared/recurrence-cases.json` enthält Testfälle, deren erwartete Werte mit dem **Originalcode** aus dem Artefakt erzeugt wurden. pytest und Vitest laden dieselbe Datei. Ändert sich die Logik, müssen beide Ports angepasst und die Fixtures neu erzeugt werden.

Daten und Uhrzeiten sind lokale Kalenderwerte ohne Zeitzone, wie im Artefakt. Jeder Kalender hat ein Feld `timezone` (Standard `Europe/Berlin`). Daraus berechnet der Server „heute“.

## 4. Datenmodell

| Tabelle              | Spalten                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`            | `id` UUID, `email` (unique, kleingeschrieben gespeichert), `hashed_password`, `is_active`, `is_verified`, `is_superuser`, `display_name`, `created_at`                                                                                                                                             |
| `access_tokens`    | `token` (PK), `user_id` → users (CASCADE), `created_at`                                                                                                                                                                                                                                                     |
| `calendars`        | `id` UUID, `name` (≤ 80), `description` (≤ 500, optional), `timezone`, `created_by` → users (SET NULL), `created_at`                                                                                                                                                                                |
| `calendar_members` | PK (`calendar_id`, `user_id`), `role` (`owner` / `editor` / `viewer`), `created_at`                                                                                                                                                                                                                  |
| `invitations`      | `id` UUID, `calendar_id`, `email`, `role` (`editor` / `viewer`), `token_hash` (SHA-256), `expires_at` (+7 Tage), `accepted_at`, `invited_by`, `created_at`                                                                                                                                   |
| `bookings`         | `id` UUID, `calendar_id` (CASCADE), `title` (≤ 80), `date`, `start_time`, `end_time`, `rec`, `until` (optional), `created_by` → users (SET NULL), `created_at`, `updated_at`; CHECK `end_time > start_time`, CHECK `until IS NULL OR until >= date`; Index (`calendar_id`, `date`) |

### Rechte

| Aktion                                                                                       | Viewer | Editor     | Owner                        |
| -------------------------------------------------------------------------------------------- | ------ | ---------- | ---------------------------- |
| Kalender und Buchungen sehen                                                                 | ✓     | ✓         | ✓                           |
| Buchung anlegen, Konflikt prüfen                                                            |        | ✓         | ✓                           |
| Buchung löschen                                                                             |        | nur eigene | alle                         |
| Kalender umbenennen oder löschen, Mitglieder einladen, Rollen ändern, Mitglieder entfernen |        |            | ✓                           |
| Kalender verlassen                                                                           | ✓     | ✓         | ✓, außer als letzter Owner |

Der letzte Owner eines Kalenders kann weder herabgestuft werden noch austreten. Wer kein Mitglied ist, bekommt `404` (nicht `403`), damit man nicht erkennen kann, welche Kalender existieren.

## 5. API-Vertrag (`/api/v1`)

### Allgemein

- JSON in beiden Richtungen, Ausnahme: `POST /auth/login` erwartet `application/x-www-form-urlencoded` mit `username` (= E-Mail) und `password`
- Datum `YYYY-MM-DD`, Uhrzeit `HH:MM`, IDs als UUID-Strings
- Session-Cookie `rb_session`: `HttpOnly`, `SameSite=Lax`, `Secure` in Produktion, Lebensdauer 14 Tage
- **CSRF**: Jeder Request mit `POST`, `PUT`, `PATCH` oder `DELETE` braucht den Header `X-Requested-With: XMLHttpRequest`, sonst antwortet die API mit `403 {"detail": "CSRF_HEADER_MISSING"}`
- Fehler haben die Form `{"detail": "<CODE>"}` oder `{"detail": {...}}`. Validierungsfehler sind das Standard-`422` von FastAPI (`{"detail": [{loc, msg, type}]}`)
- Rate Limits (Antwort `429 {"detail": "RATE_LIMIT_EXCEEDED"}` mit `Retry-After`-Header in Sekunden):
  - pro IP: Login 10/Minute; Registrierung, Verify-Anfrage und Passwort vergessen je 5/Stunde; Passwort ändern und Konto löschen je 10/Stunde
  - pro User: Einladungen 20/Stunde (schützt den Ruf der Absenderdomain vor Massenmails)
- Fehlende Anmeldung: `401`. Angemeldet, aber E-Mail nicht bestätigt: `403 {"detail": "EMAIL_NOT_VERIFIED"}` auf allen Kalender-Endpunkten
- Zu niedrige Rolle: `403 {"detail": "FORBIDDEN"}`. Kein Mitglied, oder Buchung/Einladung unbekannt: `404 {"detail": "NOT_FOUND"}`
- OpenAPI-Doku unter `/api/v1/docs` nur mit `ENABLE_DOCS=true` (in Produktion aus). Mit `COOKIE_SECURE=true` startet die API nicht, wenn `SECRET_KEY` fehlt oder kürzer als 32 Zeichen ist

### Auth und Konto

| Methode und Pfad                    | Body                                 | Antwort                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`             | `{email, password, display_name}`  | `201 User`. Schickt die Aktivierungsmail. `400 REGISTER_USER_ALREADY_EXISTS` oder `400 {code: REGISTER_INVALID_PASSWORD, reason}`                                                                                    |
| `POST /auth/request-verify-token` | `{email}`                          | immer `202`                                                                                                                                                                                                              |
| `POST /auth/verify`               | `{token}`                          | `200 User`, `400 VERIFY_USER_BAD_TOKEN` oder `VERIFY_USER_ALREADY_VERIFIED`                                                                                                                                          |
| `POST /auth/login`                | Formular `username`, `password`  | `204` + Cookie, `400 LOGIN_BAD_CREDENTIALS`. Login ist auch unverifiziert möglich, damit das Frontend „E-Mail bestätigen“ anzeigen kann                                                                            |
| `POST /auth/logout`               | –                                   | `204`, Session wird gelöscht                                                                                                                                                                                            |
| `POST /auth/forgot-password`      | `{email}`                          | immer `202`                                                                                                                                                                                                              |
| `POST /auth/reset-password`       | `{token, password}`                | `200`, `400 RESET_PASSWORD_BAD_TOKEN`. Danach werden alle Sessions des Users gelöscht                                                                                                                                 |
| `GET /users/me`                   | –                                   | `User`                                                                                                                                                                                                                   |
| `PATCH /users/me`                 | `{display_name}`                   | `User`                                                                                                                                                                                                                   |
| `POST /users/me/password`         | `{current_password, new_password}` | `204`, `400 BAD_CURRENT_PASSWORD`, `400 {code: INVALID_PASSWORD, reason}`. Die aktuelle Session bleibt, alle anderen werden gelöscht                                                                                |
| `GET /users/me/export`            | –                                   | JSON-Download mit Profil, Mitgliedschaften und eigenen Buchungen (Art. 20 DSGVO)                                                                                                                                           |
| `DELETE /users/me`                | `{password}`                       | `204`. Löscht das Konto; eigene Buchungen bleiben mit `created_by = null`. Zuerst `400 BAD_CURRENT_PASSWORD`, dann `409 {code: LAST_OWNER, calendars: [{id, name}]}`, wenn der User irgendwo der letzte Owner ist |

`User = {id, email, display_name, is_verified}`

Passwortregeln: mindestens 10 Zeichen, darf die E-Mail nicht enthalten.

Mail-Links zeigen auf das Frontend:
`{FRONTEND_URL}/verify?token=…`, `{FRONTEND_URL}/reset-password?token=…`, `{FRONTEND_URL}/invite/{token}`.
Gültigkeit: Verify 24 h, Reset 1 h, Einladung 7 Tage.

### Kalender und Mitglieder

| Methode und Pfad                                | Rolle                                   | Body                                 | Antwort                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /calendars`                              | Mitglied                                | –                                   | `Calendar[]` (nur eigene)                                                                                                                                                   |
| `POST /calendars`                             | angemeldet                              | `{name, description?, timezone?}`  | `201 Calendar`, Ersteller wird Owner                                                                                                                                        |
| `GET /calendars/{id}`                         | Viewer                                  | –                                   | `Calendar`                                                                                                                                                                  |
| `PATCH /calendars/{id}`                       | Owner                                   | `{name?, description?, timezone?}` | `Calendar`                                                                                                                                                                  |
| `DELETE /calendars/{id}`                      | Owner                                   | –                                   | `204`                                                                                                                                                                       |
| `GET /calendars/{id}/members`                 | Viewer                                  | –                                   | `Member[]`                                                                                                                                                                  |
| `PATCH /calendars/{id}/members/{user_id}`     | Owner                                   | `{role}`                           | `Member`, `409 LAST_OWNER` (hier als einfacher String)                                                                                                                    |
| `DELETE /calendars/{id}/members/{user_id}`    | Owner, oder der User selbst (austreten) | –                                   | `204`, `409 LAST_OWNER`                                                                                                                                                   |
| `POST /calendars/{id}/invitations`            | Owner                                   | `{email, role: "editor"\|"viewer"}` | `201 Invitation`, schickt Mail. `409 ALREADY_MEMBER`. Eine neue Einladung an dieselbe Adresse ersetzt die offene. Wer schon Mitglied ist und annimmt, behält seine Rolle |
| `GET /calendars/{id}/invitations`             | Owner                                   | –                                   | `Invitation[]` (offene)                                                                                                                                                     |
| `DELETE /calendars/{id}/invitations/{inv_id}` | Owner                                   | –                                   | `204`                                                                                                                                                                       |
| `GET /invitations/{token}`                    | angemeldet                              | –                                   | `{calendar_name, role, email, invited_by_name}`, `404` bei ungültig oder abgelaufen                                                                                      |
| `POST /invitations/{token}/accept`            | angemeldet + verifiziert                | –                                   | `{calendar_id}`. `403 INVITATION_EMAIL_MISMATCH`, wenn die E-Mail nicht passt                                                                                             |

```
Calendar   = {id, name, description, timezone, role, member_count, created_at}
Member     = {user_id, email, display_name, role}
Invitation = {id, email, role, expires_at, created_at}
```

### Buchungen

| Methode und Pfad                                 | Rolle                   | Body                             | Antwort                                                                                                                 |
| ------------------------------------------------ | ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /calendars/{id}/bookings`                 | Viewer                  | –                               | `Booking[]` (alle; gefiltert wird im Frontend, wie im Artefakt)                                                       |
| `POST /calendars/{id}/bookings/check`          | Editor                  | `BookingIn`                    | `{conflicts: Conflict[]}`                                                                                             |
| `POST /calendars/{id}/bookings`                | Editor                  | `BookingIn` + `force?: bool` | `201 Booking`. Bei Konflikt ohne `force`: `409 {"detail": {"code": "BOOKING_CONFLICT", "conflicts": Conflict[]}}` |
| `DELETE /calendars/{id}/bookings/{booking_id}` | Editor (eigene) / Owner | –                               | `204`                                                                                                                 |

```
BookingIn = {title, date, start, end, rec, until?}       // until wird bei rec = "none" ignoriert
Booking   = {id, title, date, start, end, rec, until, created_by, created_by_name, created_at}
Conflict  = {booking: Booking, dates: string[]}          // dates = alle betroffenen Termine der neuen Buchung
```

Validierung `BookingIn` (`422` bei Verstoß): Titel 1–80 Zeichen nach Trim, `end > start`, `until >= date`, `rec` aus der festen Liste.

### Sonstiges

`GET /health` → `{"status": "ok"}`. Prüft die Datenbank mit `SELECT 1`, sonst `503 {"detail": "DATABASE_UNAVAILABLE"}`.

Neue Buchungen sperren beim Speichern die Kalenderzeile (`SELECT … FOR UPDATE`). So können zwei gleichzeitige Buchungen nicht beide die Konfliktprüfung bestehen. Die Live-Prüfung im Frontend läuft lokal, `/bookings/check` wird vom Frontend derzeit nicht genutzt.

## 6. Frontend

| Route                                            | Zugriff     | Inhalt                                                                                                                                |
| ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                            | öffentlich | Leitet zu `/app` weiter; wer nicht angemeldet ist, landet von dort auf `/login`                                                    |
| `/login`, `/register`                        | öffentlich |                                                                                                                                       |
| `/verify?token=`                               | öffentlich | bestätigt automatisch und zeigt das Ergebnis                                                                                         |
| `/forgot-password`, `/reset-password?token=` | öffentlich |                                                                                                                                       |
| `/invite/:token`                               | angemeldet  | Einladung ansehen und annehmen                                                                                                        |
| `/impressum`, `/datenschutz`                 | öffentlich | Vorlagen mit Platzhaltern                                                                                                             |
| `/app`                                         | verifiziert | Kalenderliste, neuen Kalender anlegen                                                                                                 |
| `/app/c/:id`                                   | Viewer+     | Portierte Raumbelegung: Formular (nur Editor+), Live-Prüfung, 4-Wochen-/Jahresansicht, Liste                                         |
| `/app/c/:id/settings`                          | Mitglied    | Owner: Name, Mitglieder, Rollen, Einladungen, Kalender löschen. Alle anderen: Mitgliederliste (nur lesen) und „Kalender verlassen“ |
| `/account`                                     | angemeldet  | Name, Passwort ändern, Datenexport, Konto löschen                                                                                   |

Angemeldete, aber unverifizierte User sehen auf allen `/app`-Routen nur den Hinweis „Bitte bestätige deine E-Mail“ mit „Link erneut senden“.

Jede Seite hat einen Footer mit Impressum und Datenschutz.

## 7. Rechtliches (Vorlagen, keine Rechtsberatung)

- **Impressum** nach § 5 DDG: Name/Anbieter, ladungsfähige Anschrift, E-Mail, ggf. Vertretungsberechtigte, Register und USt-ID, verantwortlich nach § 18 Abs. 2 MStV, falls redaktionelle Inhalte
- **Datenschutzerklärung** nach Art. 13 DSGVO: Verantwortlicher, Hosting (Hetzner, AV-Vertrag), Server-Logfiles (Art. 6 Abs. 1 lit. f, Speicherdauer), Registrierung und Konto (Art. 6 Abs. 1 lit. b), E-Mail-Versand (Auftragsverarbeiter), Session-Cookie (§ 25 Abs. 2 TDDDG), keine Analyse- oder Tracking-Dienste, keine externen Fonts, Speicherdauer und Löschung, Betroffenenrechte (Art. 15–21), Beschwerderecht bei der Aufsichtsbehörde
- Vor dem Go-live prüft der Betreiber beide Texte rechtlich (z. B. eRecht24-Generator oder Anwalt)
- AV-Verträge nach Art. 28 DSGVO mit Hoster und Mailanbieter abschließen

## 8. Infrastruktur und Betrieb

- **Server**: Hetzner Cloud, kleine Shared-vCPU-Instanz (2 vCPU, 4 GB RAM), Standort Deutschland, Ubuntu LTS, ca. 5–10 € im Monat. Backups in Hetzner Object Storage (wenige Euro im Monat; alternativ Storage Box per SFTP)
- **Härtung**: nur SSH-Keys, kein Root-Login, Firewall offen nur für 22, 80 und 443, `unattended-upgrades`, eigener Deploy-User in der Gruppe `docker`
- **DNS**: A- und AAAA-Record auf den Server; SPF, DKIM und DMARC für die Absenderdomain des Mailanbieters
- **Compose (Produktion)**: `caddy`, `backend` (führt beim Start `alembic upgrade head` aus), `db`, `backup`. Siehe `deploy/`
- **Secrets**: `.env` nur auf dem Server, Vorlage ist `.env.example`
- **Backups**: täglich per Host-Cron `pg_dump` in ein mit restic verschlüsseltes Repository (`deploy/backup/`); Aufbewahrung 7 Tage, 4 Wochen, 6 Monate. Die Wiederherstellung einmal im Quartal testen
- **Monitoring**: externer Uptime-Check auf `https://<domain>/api/v1/health`; Logs über `docker compose logs`; Fehler-Tracking (z. B. selbst gehostetes GlitchTip) bei Bedarf später

Die Einrichtung Schritt für Schritt steht in `deploy/server-setup.md`.
