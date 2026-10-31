import { Link } from 'react-router';
import { LegalPage, V } from '../legal/Legal';
import { AUTHORITY, OPERATOR, PROCESSORS, RETENTION, SITE } from '../legal/site';

export function Datenschutz() {
  const o = OPERATOR;
  return (
    <LegalPage title="Datenschutzerklärung">
      <p className="hint">
        Stand: <V>{SITE.lastUpdated}</V>
      </p>
      <p>
        Hier erfährst du, welche personenbezogenen Daten wir verarbeiten, wenn du {SITE.appName}{' '}
        unter <V>{SITE.domain}</V> nutzt, wozu wir das tun und welche Rechte du hast. Wir
        verarbeiten nur, was für den Betrieb nötig ist. Es gibt keine Werbung, kein Tracking und
        keine Analyse-Dienste.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        <V>{o.name}</V>
        <br />
        <V>{o.street}</V>
        <br />
        <V>{o.city}</V>
        <br />
        <V>{o.country}</V>
        <br />
        E-Mail: <V>{o.email}</V>
      </p>
      {o.dataProtectionOfficer && (
        <p>
          Datenschutzbeauftragte:r: <V>{o.dataProtectionOfficer}</V>
        </p>
      )}

      <h2>2. Hosting</h2>
      <p>
        Die Anwendung und die Datenbank laufen auf Servern der {PROCESSORS.hosting.name},{' '}
        {PROCESSORS.hosting.address}, im <V>{PROCESSORS.hosting.location}</V>. Dort liegen auch die
        verschlüsselten Datensicherungen. Hetzner verarbeitet die Daten nur in unserem Auftrag; mit
        Hetzner besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO. Eine Übermittlung
        in Länder außerhalb der EU findet nicht statt.
      </p>

      <h2>3. Server-Logfiles</h2>
      <p>
        Bei jedem Aufruf speichert der Webserver automatisch: IP-Adresse, Datum und Uhrzeit,
        aufgerufene Adresse, HTTP-Statuscode, übertragene Datenmenge, Referrer und Browserkennung
        (User-Agent). Wir brauchen diese Daten, um die Seite technisch auszuliefern, Fehler zu
        finden und Angriffe abzuwehren (zum Beispiel zu viele Anmeldeversuche von einer IP-Adresse).
      </p>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist ein
        sicherer und stabiler Betrieb. Die Logfiles werden nach <V>{RETENTION.serverLogs}</V>{' '}
        gelöscht. Um Anmeldeversuche zu begrenzen, zählt der Server außerdem Anfragen pro
        IP-Adresse; diese Zähler verfallen nach spätestens einer Stunde.
      </p>

      <h2>4. Registrierung und Konto</h2>
      <p>
        Für ein Konto speichern wir deine E-Mail-Adresse, deinen Namen, dein Passwort (nur als
        Argon2-Hash, nie im Klartext), ob deine E-Mail-Adresse bestätigt ist und wann du dich
        registriert hast. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag).
      </p>
      <p>
        Den Namen sehen die anderen Mitglieder der Kalender, in denen du Mitglied bist, ebenso deine
        E-Mail-Adresse in der Mitgliederliste. Bei Buchungen, die du anlegst, wird dein Name
        angezeigt.
      </p>

      <h2>5. Kalender, Buchungen und Einladungen</h2>
      <p>
        Wir speichern die Kalender, die du anlegst, deine Mitgliedschaften und Rollen sowie die
        Buchungen mit Titel, Datum, Uhrzeit, Wiederholung und wer sie angelegt hat. Rechtsgrundlage
        ist Art. 6 Abs. 1 lit. b DSGVO. Bitte trage in Buchungstitel keine sensiblen Daten über
        andere Personen ein.
      </p>
      <p>
        Wenn dich jemand einlädt, speichern wir deine E-Mail-Adresse, die vorgesehene Rolle und wer
        eingeladen hat, und schicken dir eine Einladungs-Mail. Rechtsgrundlage ist Art. 6 Abs. 1
        lit. f DSGVO; das berechtigte Interesse liegt darin, gemeinsam einen Raum zu planen. Nicht
        angenommene Einladungen verfallen nach {RETENTION.invitation}.
      </p>

      <h2>6. E-Mail-Versand</h2>
      <p>
        Wir schicken nur E-Mails, die für dein Konto nötig sind: Bestätigung der E-Mail-Adresse,
        Zurücksetzen des Passworts und Einladungen. Kein Newsletter. Für den Versand nutzen wir{' '}
        <V>{PROCESSORS.email.name}</V>, <V>{PROCESSORS.email.address}</V>, Serverstandort{' '}
        <V>{PROCESSORS.email.location}</V>, als Auftragsverarbeiter nach Art. 28 DSGVO. Übermittelt
        werden Empfängeradresse und Inhalt der Mail. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO,
        bei Einladungen lit. f.
      </p>

      <h2>7. Cookies</h2>
      <p>
        Wir setzen genau ein Cookie: <code>rb_session</code>. Es hält dich nach der Anmeldung
        angemeldet, enthält nur eine zufällige Sitzungskennung und ist für Skripte nicht lesbar
        (HttpOnly). Es wird beim Abmelden gelöscht, sonst nach {RETENTION.session}. Das Cookie ist
        technisch unbedingt erforderlich, damit der von dir gewünschte Dienst funktioniert (§ 25
        Abs. 2 Nr. 2 TDDDG); deshalb fragen wir nicht nach einer Einwilligung. Rechtsgrundlage für
        die damit verbundene Verarbeitung ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h2>8. Keine Analyse, kein Tracking, keine externen Inhalte</h2>
      <p>
        Wir nutzen keine Analyse- oder Tracking-Dienste, keine Social-Media-Plugins und keine
        Werbung. Schriftarten und alle anderen Dateien liefern wir selbst aus; beim Aufruf der Seite
        wird keine Verbindung zu fremden Servern (etwa Google Fonts oder CDNs) aufgebaut.
      </p>

      <h2>9. Speicherdauer und Löschung</h2>
      <ul>
        <li>
          Kontodaten speichern wir, bis du dein Konto löschst. Das kannst du jederzeit selbst unter{' '}
          <Link to="/account">Konto</Link> tun.
        </li>
        <li>
          Beim Löschen des Kontos entfernen wir Profil und Mitgliedschaften sofort. Deine Buchungen
          bleiben in den Kalendern, aber ohne Verbindung zu dir und ohne deinen Namen.
        </li>
        <li>
          Wird ein Kalender gelöscht, löschen wir alle zugehörigen Buchungen, Mitgliedschaften und
          Einladungen.
        </li>
        <li>
          Links zur E-Mail-Bestätigung gelten {RETENTION.verifyLink}, Links zum Zurücksetzen des
          Passworts {RETENTION.resetLink}.
        </li>
        <li>
          Server-Logfiles: <V>{RETENTION.serverLogs}</V>.
        </li>
        <li>
          Datensicherungen: {RETENTION.backups}. Gelöschte Daten verschwinden spätestens dann auch
          aus den Sicherungen.
        </li>
      </ul>

      <h2>10. Deine Rechte</h2>
      <p>Du hast gegenüber uns das Recht auf</p>
      <ul>
        <li>Auskunft über deine gespeicherten Daten (Art. 15 DSGVO),</li>
        <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO),</li>
        <li>Löschung (Art. 17 DSGVO),</li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
        <li>
          Datenübertragbarkeit (Art. 20 DSGVO) – unter <Link to="/account">Konto</Link> kannst du
          deine Daten als JSON-Datei herunterladen,
        </li>
        <li>
          Widerspruch gegen Verarbeitungen, die auf Art. 6 Abs. 1 lit. f DSGVO beruhen, aus Gründen,
          die sich aus deiner besonderen Situation ergeben (Art. 21 DSGVO).
        </li>
      </ul>
      <p>
        Schreib uns dafür einfach an <V>{o.email}</V>. Eine automatisierte Entscheidungsfindung oder
        Profiling (Art. 22 DSGVO) findet nicht statt.
      </p>

      <h2>11. Beschwerderecht</h2>
      <p>
        Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum
        Beispiel bei der für uns zuständigen: <V>{AUTHORITY.name}</V>, <V>{AUTHORITY.address}</V>,{' '}
        <V>{AUTHORITY.url}</V>.
      </p>

      <h2>12. Pflicht zur Bereitstellung</h2>
      <p>
        Du bist nicht verpflichtet, uns Daten zu geben. Ohne E-Mail-Adresse, Namen und Passwort
        können wir dir aber kein Konto anlegen.
      </p>
    </LegalPage>
  );
}
