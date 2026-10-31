import { Link } from 'react-router';

export function NotFound({ what = 'Seite' }: { what?: string }) {
  return (
    <section className="panel narrow" aria-labelledby="h-404">
      <title>Nicht gefunden – Raumbelegung</title>
      <h1 id="h-404" className="h-page">
        {what} nicht gefunden
      </h1>
      <p>
        {what === 'Kalender'
          ? 'Diesen Kalender gibt es nicht, oder du bist kein Mitglied.'
          : 'Diese Adresse gibt es hier nicht.'}
      </p>
      <p className="links">
        <Link to="/app">Zu deinen Kalendern</Link>
        <Link to="/">Zur Startseite</Link>
      </p>
    </section>
  );
}
