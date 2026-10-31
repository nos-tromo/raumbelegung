import { LegalPage, V } from '../legal/Legal';
import { OPERATOR } from '../legal/site';

export function Impressum() {
  const o = OPERATOR;
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        <V>{o.name}</V>
        {o.legalForm && (
          <>
            <br />
            <V>{o.legalForm}</V>
          </>
        )}
        <br />
        <V>{o.street}</V>
        <br />
        <V>{o.city}</V>
        <br />
        <V>{o.country}</V>
      </p>

      {o.representatives && (
        <>
          <h2>Vertreten durch</h2>
          <p>
            <V>{o.representatives}</V>
          </p>
        </>
      )}

      <h2>Kontakt</h2>
      <p>
        E-Mail: <V>{o.email}</V>
        {o.phone && (
          <>
            <br />
            Telefon: <V>{o.phone}</V>
          </>
        )}
      </p>

      {o.register && (
        <>
          <h2>Registereintrag</h2>
          <p>
            <V>{o.register}</V>
          </p>
        </>
      )}

      {o.vatId && (
        <>
          <h2>Umsatzsteuer-Identifikationsnummer</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: <V>{o.vatId}</V>
          </p>
        </>
      )}

      {o.editorialResponsible && (
        <>
          <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
          <p>
            <V>{o.editorialResponsible}</V>
          </p>
        </>
      )}

      <h2>Verbraucherstreitbeilegung</h2>
      <p className="hint">
        <V>
          [Hinweis entfernen: Pflichtangabe nach § 36 VSBG erst ab mehr als 10 Beschäftigten, für
          kleinere Anbieter freiwillig]
        </V>
      </p>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Für eigene Inhalte auf diesen Seiten sind wir nach den allgemeinen Gesetzen verantwortlich.
        Für Inhalte, die Nutzerinnen und Nutzer selbst eintragen (zum Beispiel Namen von Kalendern
        und Buchungen), sind wir erst ab Kenntnis einer konkreten Rechtsverletzung verantwortlich
        (Art. 6 der Verordnung (EU) 2022/2065, Digital Services Act). Solche Inhalte entfernen wir
        dann umgehend. Hinweise bitte an die oben genannte E-Mail-Adresse.
      </p>
    </LegalPage>
  );
}
