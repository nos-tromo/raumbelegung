import { Link, isRouteErrorResponse, useRouteError } from 'react-router';

/** Last resort if a page crashes while rendering. */
export function ErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="wrap">
      <section className="panel narrow" aria-labelledby="h-err">
        <title>Fehler – Raumbelegung</title>
        <h1 id="h-err" className="h-page">
          {notFound ? 'Seite nicht gefunden' : 'Da ist etwas schiefgelaufen'}
        </h1>
        <p>
          {notFound
            ? 'Diese Adresse gibt es hier nicht.'
            : 'Lade die Seite neu. Wenn der Fehler bleibt, versuche es später noch einmal.'}
        </p>
        <p className="links">
          <Link to="/">Zur Startseite</Link>
        </p>
      </section>
      <footer className="site">
        <Link to="/impressum">Impressum</Link>
        <span aria-hidden="true">·</span>
        <Link to="/datenschutz">Datenschutz</Link>
      </footer>
    </div>
  );
}
