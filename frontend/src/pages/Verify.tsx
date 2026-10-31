import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/context';
import { ApiError, errorMessage } from '../lib/api';
import { useVerify } from '../lib/queries';

export function Verify() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user } = useAuth();
  const verify = useVerify();
  const { mutate } = verify;
  const sent = useRef(false);

  useEffect(() => {
    // Once only, also under StrictMode's double effects.
    if (!token || sent.current) return;
    sent.current = true;
    mutate(token);
  }, [token, mutate]);

  const already =
    verify.error instanceof ApiError && verify.error.code === 'VERIFY_USER_ALREADY_VERIFIED';
  const ok = verify.isSuccess || already;
  const next = user ? (
    <Link className="btn" to="/app">
      Zu deinen Kalendern
    </Link>
  ) : (
    <Link className="btn" to="/login">
      Zur Anmeldung
    </Link>
  );

  return (
    <section className="panel narrow" aria-labelledby="h-verify" aria-live="polite">
      <title>E-Mail bestätigen – Raumbelegung</title>
      <h1 id="h-verify" className="h-page">
        E-Mail bestätigen
      </h1>
      {!token ? (
        <p className="check bad">
          <strong>Kein Bestätigungscode</strong>
          Öffne den Link aus der E-Mail vollständig, oder fordere nach der Anmeldung einen neuen an.
        </p>
      ) : ok ? (
        <>
          <p className="check ok">
            <strong>
              {already ? 'Schon bestätigt' : 'Danke, deine E-Mail-Adresse ist bestätigt'}
            </strong>
            Du kannst jetzt Kalender anlegen und Räume buchen.
          </p>
          <p>{next}</p>
        </>
      ) : verify.isError ? (
        <>
          <p className="check bad">
            <strong>Bestätigung fehlgeschlagen</strong>
            {errorMessage(verify.error)}
          </p>
          <p>
            {user ? (
              <Link to="/app">Neuen Link anfordern</Link>
            ) : (
              <Link to="/login">Anmelden und neuen Link anfordern</Link>
            )}
          </p>
        </>
      ) : (
        <p className="check">
          <strong>Einen Moment</strong>
          Deine E-Mail-Adresse wird bestätigt …
        </p>
      )}
    </section>
  );
}
