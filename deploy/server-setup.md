# Server einrichten (Hetzner Cloud, Ubuntu LTS)

Einmalige Einrichtung, ca. 30–45 Minuten. Danach deployt GitHub Actions bei jedem Push auf `main`.

## 1. Vorbereitung

1. **Domain** registrieren oder eine bestehende nutzen.
2. **Mailanbieter** mit Sitz in der EU wählen (z. B. Brevo oder Mailjet), Absenderdomain verifizieren und **SPF, DKIM und DMARC** im DNS eintragen. SMTP-Zugangsdaten notieren.
3. **AV-Verträge** (Art. 28 DSGVO) mit Hetzner (in der Cloud Console unter „Datenschutz“) und dem Mailanbieter abschließen.
4. Für Backups einen Bucket im **Hetzner Object Storage** anlegen und einen Access Key erzeugen.

## 2. Server anlegen

- Hetzner Cloud Console → neues Projekt → Server
  - Standort: Falkenstein oder Nürnberg
  - Image: Ubuntu (aktuelle LTS)
  - Typ: kleinste Shared-vCPU-Instanz mit 2 vCPU und 4 GB RAM
  - eigenen **SSH-Key** hinterlegen, kein Passwort
- **Firewall** anlegen und dem Server zuweisen: eingehend nur TCP 22, TCP 80, TCP 443 und UDP 443
- DNS: `A`-Record (und `AAAA`) der Domain auf die Server-IP setzen

## 3. Grundhärtung

```bash
ssh root@SERVER_IP

apt update && apt -y full-upgrade
apt -y install unattended-upgrades make
dpkg-reconfigure -plow unattended-upgrades

# Deploy-User anlegen und SSH-Key übernehmen
adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh

# Root-Login und Passwort-Login abschalten
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

## 4. Docker installieren

Nach der offiziellen Anleitung (https://docs.docker.com/engine/install/ubuntu/) aus dem Docker-Repository installieren, danach:

```bash
usermod -aG docker deploy
```

## 5. App ablegen

Als `deploy`:

```bash
sudo mkdir -p /opt/raumbelegung && sudo chown deploy:deploy /opt/raumbelegung
cd /opt/raumbelegung
# Gebraucht werden nur der Ordner deploy/, das Makefile und die Vorlage .env.example, z. B. vom Rechner aus:
#   scp -r deploy Makefile deploy@SERVER_IP:/opt/raumbelegung/
#   scp .env.example deploy@SERVER_IP:/opt/raumbelegung/deploy/.env
nano deploy/.env                    # alle Werte ausfüllen, OWNER in den Image-Namen ersetzen
chmod 600 deploy/.env
```

Ändern sich später `deploy/` oder das `Makefile`, beides erneut kopieren. Der Deploy-Workflow aktualisiert nur die Images.

Ist das GHCR-Paket privat, einmal anmelden (Personal Access Token mit `read:packages`):

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u GITHUB_USER --password-stdin
```

## 6. Starten

```bash
cd /opt/raumbelegung
make pull up                        # Images holen und starten
make health                         # backend und db „healthy“, web „running“
curl -fsS https://DOMAIN/api/v1/health
```

Caddy holt das TLS-Zertifikat beim ersten Aufruf automatisch. Die Datenbank-Migrationen laufen beim Start des Backends. `make` ohne Argument zeigt alle Befehle für den Server.

## 7. Backups einrichten

```bash
# Testlauf (initialisiert beim ersten Mal das restic-Repository)
cd /opt/raumbelegung
make backup

# Täglich um 03:15 Uhr
crontab -e
15 3 * * * cd /opt/raumbelegung/deploy && docker compose -f docker-compose.prod.yml --profile backup run --rm backup >> /home/deploy/backup.log 2>&1
```

Die Wiederherstellung einmal im Quartal testen, am besten auf einem Wegwerf-Server:

```bash
make snapshots                      # vorhandene Backups
make restore                        # neuestes Backup; ein bestimmtes: make restore SNAPSHOT=<ID>
```

`make restore` fragt nach, hält das Backend an, spielt das Backup ein und startet das Backend wieder.

## 8. Automatisches Deployment (GitHub Actions)

Im GitHub-Repo unter *Settings → Secrets and variables → Actions* anlegen:

| Secret | Inhalt |
|---|---|
| `DEPLOY_HOST` | Server-IP oder Hostname |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | privater SSH-Key nur für Deployments (öffentlicher Teil in `/home/deploy/.ssh/authorized_keys`) |
| `DEPLOY_KNOWN_HOSTS` | Ausgabe von `ssh-keyscan SERVER_IP` |

Unter *Settings → Environments* eine Umgebung `production` anlegen, bei Bedarf mit manueller Freigabe.

## 9. Monitoring

- Externen Uptime-Check auf `https://DOMAIN/api/v1/health` einrichten (z. B. Uptime Kuma auf einem anderen Host oder ein EU-Dienst)
- Status: `make health`; Logs: `make logs S=backend` (ohne `S` alle Dienste)
- Speicherplatz im Blick behalten: `docker system df`, `df -h`

## Checkliste vor dem Go-live

- [ ] Impressum und Datenschutzerklärung ausgefüllt (`frontend/src/legal/site.ts`), rechtlich geprüft, Hinweis „Vorlage“ entfernt
- [ ] AV-Verträge mit Hoster und Mailanbieter abgeschlossen
- [ ] SPF, DKIM und DMARC gesetzt; Testmail landet nicht im Spam
- [ ] Registrierung, Aktivierungslink, Passwort-Reset und Einladung einmal komplett auf der Live-Domain durchgespielt
- [ ] Backup gelaufen **und** Restore getestet
- [ ] `RESTIC_PASSWORD` und `.env` außerhalb des Servers sicher abgelegt (Passwortmanager)
