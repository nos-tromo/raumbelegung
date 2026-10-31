# Lokal testen

Diese Anleitung bringt Raumbelegung auf deinem Rechner zum Laufen und führt einmal durch alle Funktionen. Alle Mails bleiben lokal: Sie landen in Mailpit, nichts geht ins Internet. Du kannst also beliebige Adressen wie `erika@example.org` verwenden.

Dauer: etwa 10 Minuten Einrichtung, 30 bis 45 Minuten für den Testdurchlauf.

| Was | Adresse |
|---|---|
| App | http://localhost:5173 |
| Mailpit (alle Mails) | http://localhost:8025 |
| API-Dokumentation | http://localhost:8000/api/v1/docs |
| PostgreSQL | `localhost:5432`, Benutzer, Passwort und Datenbank: `raumbelegung` |

## 1. Voraussetzungen

- **Docker Desktop**, gestartet
- **uv** (`brew install uv`)
- **Node.js 26**, mindestens 24 (`brew install node`)
- **make** (auf dem Mac Teil der Xcode Command Line Tools: `xcode-select --install`)

```bash
docker info --format '{{.ServerVersion}}'   # Fehlermeldung = Docker läuft nicht
uv --version
node --version
```

Die Ports 5173, 8000, 5432, 1025 und 8025 müssen frei sein. Keine Ausgabe heißt frei:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(5173|8000|5432|1025|8025) '
```

## 2. Einmalig einrichten

Alle Befehle im Hauptverzeichnis des Repos. `make` ohne Argument zeigt alle verfügbaren Befehle.

```bash
make install
```

Das legt `backend/.env` aus der Vorlage an (eine vorhandene bleibt unverändert) und installiert die Python- und npm-Pakete. Die Dev-Konfiguration nutzt PostgreSQL und Mailpit aus Docker. Rate-Limits sind dort ausgeschaltet.

## 3. Starten

```bash
make dev
```

Das startet PostgreSQL und Mailpit in Docker (sie laufen im Hintergrund weiter), wendet die Migrationen an und startet Backend und Frontend mit Hot-Reload im selben Terminal. Bereit, sobald `Application startup complete.` und `VITE … ready` erscheinen. `Strg+C` beendet Backend und Frontend.

Wer lieber getrennte Terminals hat: einmal `make migrate` (startet auch die Container), dann `make backend` und `make frontend` je in einem eigenen Terminal. `make health` zeigt jederzeit, was läuft.

Jetzt http://localhost:5173 öffnen. Immer `localhost` verwenden, nicht `127.0.0.1`: Die Links in den Mails zeigen auf `localhost`, und das Session-Cookie gilt nur für den Hostnamen, unter dem du dich angemeldet hast.

## 4. Automatische Tests (optional, etwa 2 Minuten)

```bash
make test       # pytest (SQLite) + vitest, dazu die Serienlogik in drei weiteren Zeitzonen
make verify     # Ruff, Mypy, ESLint und Build, wie in der CI
make test-pg    # optional: Backend-Tests gegen PostgreSQL statt SQLite
```

Erwartet: alles grün, keine Meldungen von Ruff, Mypy oder ESLint. `make test-pg` legt die Test-Datenbank `raumbelegung_test` beim ersten Mal an; die Tests leeren sie bei jedem Lauf.

## 5. Testdurchlauf im Browser

Du brauchst zwei Benutzer: **Erika** im normalen Fenster und **Max** in einem privaten Fenster (oder in einem zweiten Browser). Lass Mailpit (http://localhost:8025) am besten in einem eigenen Tab offen.

Passwörter: mindestens 10 Zeichen, ohne die eigene E-Mail-Adresse.

### A. Registrierung und Aktivierung

1. „Registrieren“ (oben rechts): E-Mail `erika@example.org`, Name `Erika Mustermann`, Passwort zweimal eingeben, dann „Konto anlegen“.
   - [ ] Seite „Fast geschafft“
2. Gegenprobe mit zu kurzem Passwort oder abweichender Wiederholung.
   - [ ] Fehlermeldung am Feld, es wird kein Konto angelegt
3. „Zur Anmeldung“ und als Erika anmelden, **ohne** vorher den Link aus der Mail zu öffnen.
   - [ ] Hinweis „Bitte bestätige deine E-Mail“ mit Button „Link erneut senden“
4. „Link erneut senden“ klicken.
   - [ ] „Neuer Link ist unterwegs …“, in Mailpit liegt eine zweite Mail
5. In Mailpit die Mail „Bitte bestätige deine E-Mail-Adresse“ öffnen und den Link klicken.
   - [ ] „Danke, deine E-Mail-Adresse ist bestätigt“
6. Denselben Link noch einmal öffnen.
   - [ ] „Schon bestätigt“

### B. Anmelden und Abmelden

1. „Abmelden“, dann mit falschem Passwort anmelden.
   - [ ] „E-Mail-Adresse oder Passwort stimmt nicht.“
2. Mit dem richtigen Passwort anmelden.
   - [ ] Seite „Deine Kalender“
3. „Abmelden“, dann http://localhost:5173/app direkt aufrufen.
   - [ ] Weiterleitung zur Anmeldung

### C. Passwort vergessen

1. Auf der Anmeldeseite „Passwort vergessen?“ klicken, `erika@example.org` eingeben, dann „Link anfordern“.
   - [ ] „Schau in dein Postfach“, in Mailpit liegt die Mail „Passwort zurücksetzen“
2. Dasselbe mit einer unbekannten Adresse, z. B. `niemand@example.org`.
   - [ ] Gleiche Meldung, aber **keine** Mail (verrät nicht, wer registriert ist)
3. Link aus der Mail öffnen, neues Passwort zweimal eingeben, dann „Passwort speichern“.
   - [ ] Anmeldeseite mit „Passwort geändert“
4. Mit dem alten Passwort anmelden, danach mit dem neuen.
   - [ ] Das alte Passwort wird abgelehnt, das neue funktioniert
5. Den Link aus der Reset-Mail noch einmal benutzen.
   - [ ] „Der Link zum Zurücksetzen ist ungültig oder abgelaufen …“ (jeder Link gilt nur einmal)

### D. Kalender anlegen

1. „Deine Kalender“: unter „Neuer Kalender“ den Namen `Gemeinschaftsraum` eintragen, dann „Kalender anlegen“.
   - [ ] Der Kalender erscheint in der Liste und lässt sich öffnen

### E. Buchungen und Konfliktprüfung

1. Unter „Neue Buchung“: Veranstaltung `Chor`, als Datum den nächsten Montag, 18:00 bis 20:00, Wiederholung „Wöchentlich (jeden Montag)“.
   - [ ] Die Raumprüfung zeigt schon beim Ausfüllen „Raum frei“
2. „Buchung speichern“.
   - [ ] „Buchung gespeichert.“, unter „Belegung“ steht der Chor an jedem Montag, unter „Alle Buchungen“ als Serie
3. Zweite Buchung: `Probe`, der Montag in zwei Wochen, 19:00 bis 21:00, „Einmalig“.
   - [ ] Rote Box „Raum bereits vergeben“ mit dem Chor-Termin, der Button heißt jetzt „Trotzdem speichern“
4. „Trotzdem speichern“.
   - [ ] „Gespeichert, trotz Überschneidung.“, in der Belegung erscheint die Markierung „Überschneidung“
5. Bei einer neuen Buchung „Bis“ früher als „Von“ eintragen.
   - [ ] „Uhrzeit prüfen“, Speichern ist nicht möglich
6. Eine Serie, bei der „Serie endet am“ vor dem ersten Termin liegt.
   - [ ] „Enddatum prüfen“
7. Die übrigen Wiederholungen ausprobieren: „Täglich“, „Montag bis Freitag“ und die beiden „Monatlich“-Varianten. Ihre Beschriftung richtet sich nach dem gewählten Datum, z. B. „Monatlich (jeden letzten Montag)“.
   - [ ] Die Belegung zeigt jeweils die erwarteten Tage
8. In der Belegung von „4 Wochen“ auf die Jahreszahl umschalten.
   - [ ] Die Monate erscheinen als aufklappbare Abschnitte
9. Bei einer Buchung „Löschen“ klicken und abwarten.
   - [ ] Der Button wird zu „Wirklich löschen“ und springt nach ein paar Sekunden zurück
10. „Löschen“ und gleich danach „Wirklich löschen“.
    - [ ] Die Buchung ist weg

### F. Einladen und Rollen

1. Als Erika im Kalender auf „Einstellungen“, dann unter „Einladen“: `max@example.org`, Rolle „Nur ansehen“, „Einladung senden“.
   - [ ] „Einladung an max@example.org verschickt. Sie ist 7 Tage gültig.“, Eintrag unter „Offene Einladungen“
2. In Mailpit die Mail „Einladung zum Kalender „Gemeinschaftsraum““ öffnen. Den Link kopieren und im **privaten Fenster** öffnen.
   - [ ] Anmeldeseite mit „Melde dich an, um die Einladung anzunehmen.“
3. Im privaten Fenster über „Registrieren“ Max anlegen (`max@example.org`, Name `Max Mustermann`). Den Bestätigungslink aus Mailpit im privaten Fenster öffnen. Danach den Einladungslink noch einmal öffnen und als Max anmelden.
   - [ ] Einladungsseite mit Rolle „Nur ansehen“, der Button „Einladung annehmen“ funktioniert
4. Max öffnet den Kalender.
   - [ ] Er sieht alle Buchungen, aber kein Buchungsformular und keine „Löschen“-Buttons
5. Erika: „Einstellungen“, unter „Mitglieder“ bei Max die Rolle „Bearbeiten“ wählen (wird sofort gespeichert). Max lädt die Seite neu.
   - [ ] Max sieht das Formular und kann buchen. „Löschen“ erscheint nur bei seinen eigenen Buchungen
6. Erika lädt `anna@example.org` ein. Max öffnet diesen Einladungslink.
   - [ ] Hinweis „Andere E-Mail-Adresse“, Max kann die Einladung nicht annehmen
7. Erika zieht die Einladung an Anna zurück („Zurückziehen“, dann „Wirklich zurückziehen“). Max öffnet den Link erneut.
   - [ ] „Einladung ungültig“
8. Erika klickt unter „Kalender verlassen“ auf „Kalender verlassen“ und dann auf „Wirklich verlassen“.
   - [ ] Abgelehnt: „Du bist die einzige Person, die diesen Kalender verwaltet …“
9. Erika gibt Max die Rolle „Verwalten“ und verlässt den Kalender dann.
   - [ ] Das klappt. Der Kalender verschwindet aus Erikas Liste, Max verwaltet ihn

### G. Konto

1. Oben rechts auf den eigenen Namen klicken („Dein Konto“). Den Namen ändern, dann „Name speichern“.
   - [ ] „Gespeichert.“, der neue Name steht oben rechts
2. „Passwort ändern“ mit falschem aktuellem Passwort.
   - [ ] „Das Passwort stimmt nicht.“
3. Dasselbe mit dem richtigen aktuellen Passwort.
   - [ ] „Passwort geändert. Auf anderen Geräten bist du jetzt abgemeldet.“ Du selbst bleibst angemeldet
4. „Daten herunterladen“.
   - [ ] Eine JSON-Datei mit deinen Daten wird heruntergeladen
5. Max (jetzt einziger Verwalter) will sein Konto löschen: Passwort eingeben, dann „Konto endgültig löschen“.
   - [ ] „Konto nicht gelöscht“ mit Hinweis auf den Kalender
6. Max löscht den Kalender: „Einstellungen“, unter „Kalender löschen“ den Namen eintippen, dann „Kalender endgültig löschen“. Danach löscht er sein Konto.
   - [ ] Beides klappt, Max ist abgemeldet und kann sich nicht mehr anmelden
7. Erika löscht ihr Konto.
   - [ ] Abgemeldet, eine Anmeldung als Erika klappt nicht mehr

### H. Rechtliches und Darstellung

1. In der Fußzeile „Impressum“ und „Datenschutz“ öffnen.
   - [ ] Beide Seiten erscheinen (noch mit Platzhaltern, siehe `frontend/src/legal/`)
2. Entwicklertools öffnen, Gerätemodus mit 375 px Breite.
   - [ ] Kein seitliches Scrollen, Formular und Übersicht sind bedienbar
3. macOS auf dunkles Erscheinungsbild umstellen.
   - [ ] Die App wechselt ins dunkle Farbschema
4. Entwicklertools, Reiter „Netzwerk“, Seite neu laden.
   - [ ] Nur Anfragen an `localhost`, keine externen Schriften oder Tracker
5. Entwicklertools, Reiter „Application“ (Safari: „Speicher“), Cookies.
   - [ ] Ein Cookie `rb_session` mit „HttpOnly“. „Secure“ kommt erst mit HTTPS dazu (Abschnitt 7)

### I. Schutzmechanismen (optional)

**CSRF-Schutz:** Schreibende Anfragen ohne den Header `X-Requested-With` lehnt die API ab.

```bash
curl -i -X POST http://localhost:8000/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"erika@example.org"}'
```

- [ ] `403` mit `{"detail": "CSRF_HEADER_MISSING"}`

**Rate-Limits:** Zum Testen in `backend/.env` `RATE_LIMIT_ENABLED=true` setzen und das Backend neu starten (`Strg+C`, dann wieder `make dev`). Der Hot-Reload reagiert nur auf Code, nicht auf die `.env`. Dann elfmal hintereinander mit falschem Passwort anmelden.

- [ ] „Zu viele Versuche. Bitte warte etwa … und versuche es dann erneut.“

Danach wieder `RATE_LIMIT_ENABLED=false` setzen und neu starten. Ein Neustart setzt die Zähler auch zurück.

## 6. Ohne Docker

Statt PostgreSQL und Mailpit geht es auch mit SQLite, die Mails erscheinen dann im Backend-Terminal. In `backend/.env` die PostgreSQL-Zeile auskommentieren und Folgendes setzen:

```bash
DATABASE_URL=sqlite+aiosqlite:///./dev.db
MAIL_BACKEND=console
```

Dann wie in Abschnitt 3 `make dev`. Mit SQLite startet `make` keine Container. Jede Mail erscheint im Terminal als Logzeile `MAIL to=… subject=…`, darunter der Text mit dem Link. Zum Zurücksetzen `make nuke` (löscht `backend/dev.db`).

## 7. Optional: Produktions-Setup lokal (Caddy, HTTPS)

Testet die Docker-Images, Caddy (TLS, Security-Header, SPA-Routing) und das Zusammenspiel wie auf dem Server. Beim ersten Mal dauert es ein paar Minuten, weil die Images gebaut werden. Mailpit muss laufen (`make services`), es empfängt auch hier die Mails.

```bash
cat > deploy/.env <<EOF
DOMAIN=localhost
WEB_IMAGE=raumbelegung-web:local
BACKEND_IMAGE=raumbelegung-backend:local
POSTGRES_USER=raumbelegung
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=raumbelegung
SECRET_KEY=$(openssl rand -hex 32)
DEFAULT_TIMEZONE=Europe/Berlin
SMTP_HOST=host.docker.internal
SMTP_PORT=1025
SMTP_STARTTLS=false
SMTP_SSL=false
MAIL_FROM=Raumbelegung <noreply@localhost>
EOF

make build up
make health      # unter „Produktion“: backend und db „healthy“, web „running“
```

Die `.env.example` passt hier nicht: Ihre Platzhalter `ghcr.io/OWNER/…` sind keine gültigen Image-Namen (Docker verlangt Kleinbuchstaben), und der SMTP-Server dort ist ein echter Anbieter.

Dann https://localhost öffnen, am besten in einem privaten Fenster. Caddy nutzt für `localhost` eine eigene Zertifizierungsstelle, deshalb warnt der Browser einmal. Die Warnung bestätigen (Chrome: „Erweitert“, dann „Weiter zu localhost“). Im privaten Fenster merkt sich der Browser den HSTS-Header für `localhost` nicht dauerhaft. Sonst kann er später auch http://localhost:5173 auf HTTPS umleiten.

- [ ] http://localhost leitet auf https://localhost um
- [ ] Ein direkter Aufruf von https://localhost/app lädt die App (kein 404)
- [ ] Registrierung, Mail in Mailpit (der Link zeigt auf `https://localhost/…`), Anmeldung und Buchung wie in Abschnitt 5
- [ ] Das Cookie `rb_session` hat jetzt auch „Secure“
- [ ] https://localhost/api/v1/docs liefert 404 (die API-Doku ist in Produktion aus)
- [ ] Antwort-Header der Seite (Entwicklertools, Reiter „Netzwerk“): `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`

Hier sind die Rate-Limits aktiv, z. B. 5 Registrierungen pro Stunde, und alle Anfragen kommen von derselben Adresse. `make restart S=backend` setzt die Zähler zurück. Solange `deploy/.env` existiert, beziehen `make ps`, `make health`, `make stop` und `make down` den Produktions-Stack mit ein.

Aufräumen:

```bash
docker compose -f deploy/docker-compose.prod.yml down -v    # Container und Test-Datenbank löschen
rm deploy/.env
docker image rm raumbelegung-web:local raumbelegung-backend:local   # optional
```

## 8. Beenden und zurücksetzen

| Was | Befehl |
|---|---|
| Backend und Frontend stoppen | `Strg+C` im Terminal von `make dev` |
| Container stoppen, Daten behalten | `make down` |
| Alles löschen (Datenbank, Mails) | `make nuke` (fragt nach), danach legt `make dev` eine leere Datenbank an |
| Nur die Mails löschen | in Mailpit „Delete all“ |

## 9. Wenn etwas hakt

| Problem | Lösung |
|---|---|
| `failed to connect to the docker API` | Docker Desktop starten und warten, bis es läuft |
| `port is already allocated` für 5432 | Es läuft schon ein anderes PostgreSQL, z. B. über Homebrew: `brew services stop postgresql@14` (Version anpassen) |
| Die App lädt, aber jede Aktion schlägt fehl, im Terminal steht `ECONNREFUSED` | Das Backend läuft nicht auf Port 8000 (`make health`) |
| `relation "users" does not exist` | Migrationen fehlen: `make migrate` (erledigt `make dev` automatisch) |
| Keine Mail in Mailpit | `make health`: Läuft `mailpit`? In `backend/.env` muss `MAIL_BACKEND=smtp` und `SMTP_PORT=1025` stehen. Fehler zeigt das Backend-Terminal (`sending mail … failed`) |
| Nach dem Klick auf einen Mail-Link nicht angemeldet | Die App wurde unter `127.0.0.1` statt `localhost` geöffnet. Überall `localhost` verwenden |
| Eine Änderung in `backend/.env` wirkt nicht | Backend neu starten (`Strg+C`, dann wieder `make dev`) |
| „Zu viele Versuche …“ | Das Rate-Limit greift: kurz warten oder das Backend neu starten |
| Der Browser leitet http://localhost:5173 auf HTTPS um | HSTS aus dem Produktions-Test (Abschnitt 7). Chrome: `chrome://net-internals/#hsts`, unter „Delete domain security policies“ `localhost` eintragen. Safari: Websitedaten für `localhost` löschen |
| `make install` oder der Build meckert über die Node-Version | Node.js 26 installieren (mindestens 24) |
