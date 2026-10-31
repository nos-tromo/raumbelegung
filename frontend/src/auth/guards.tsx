import { useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { Loading, ServerError } from '../components/Status';
import { errorMessage } from '../lib/api';
import { useRequestVerify } from '../lib/queries';
import { loginPathFor, safeNext, useAuth } from './context';

/** Logged-in users only; others go to /login?next=… */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, isLoading, error, refetch } = useAuth();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (error && user === undefined) return <ServerError error={error} onRetry={refetch} />;
  if (!user) return <Navigate to={loginPathFor(location)} replace />;
  return children ?? <Outlet />;
}

/** Verified e-mail only; unverified users see the notice instead of the page. */
export function RequireVerified({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  if (user && !user.is_verified) return <VerifyNotice email={user.email} />;
  return children ?? <Outlet />;
}

/** Pages like /login: logged-in users are sent on (to ?next= if given, else /app). */
export function RedirectIfAuthed({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;
  return children ?? <Outlet />;
}

/** "Please confirm your e-mail" with a resend button. `inline` = inside another page. */
export function VerifyNotice({ email, inline = false }: { email: string; inline?: boolean }) {
  const resend = useRequestVerify();
  const [sent, setSent] = useState(false);
  const Heading = inline ? 'h2' : 'h1';
  return (
    <section className={inline ? 'notice' : 'panel narrow'} aria-labelledby="h-verify">
      <Heading id="h-verify" className={inline ? undefined : 'h-page'}>
        Bitte bestätige deine E-Mail
      </Heading>
      <p>
        Wir haben dir einen Link an <strong>{email}</strong> geschickt. Öffne ihn, um dein Konto zu
        aktivieren. Danach kannst du Kalender anlegen und Räume buchen.
      </p>
      <p className="hint">Keine Mail bekommen? Schau auch im Spam-Ordner nach.</p>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={resend.isPending}
          onClick={() =>
            resend.mutate(email, {
              onSuccess: () => setSent(true),
            })
          }
        >
          {resend.isPending ? 'Wird gesendet …' : 'Link erneut senden'}
        </button>
      </div>
      <p className="msg" role="status">
        {sent ? 'Neuer Link ist unterwegs. Er ist 24 Stunden gültig.' : ''}
      </p>
      {resend.isError && (
        <p className="error" role="alert">
          {errorMessage(resend.error)}
        </p>
      )}
    </section>
  );
}
