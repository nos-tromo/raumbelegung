import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/context';

export function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/app" replace />;
  return (
    <div className="landing">
      <title>Raumbelegung – Räume gemeinsam planen</title>
      <section className="hero">
        <h1>Raumbelegung</h1>
        <p className="lead">
          Ein gemeinsamer Kalender für euren Raum. Jede neue Buchung wird sofort gegen alle
          wiederkehrenden Termine geprüft – für die nächsten 24 Monate.
        </p>
        <div className="actions">
          <Link className="btn" to="/register">
            Registrieren
          </Link>
          <Link className="btn ghost" to="/login">
            Anmelden
          </Link>
        </div>
      </section>
      <ul className="features">
        <li>
          <strong>Serien, wie sie wirklich sind</strong>
          Täglich, Montag bis Freitag, wöchentlich, jeden 2. Mittwoch oder jeden letzten Freitag im
          Monat.
        </li>
        <li>
          <strong>Konflikte sofort sehen</strong>
          Schon beim Eintippen siehst du, ob und wann sich ein Termin mit einem anderen
          überschneidet.
        </li>
        <li>
          <strong>Mehrere Räume, klare Rollen</strong>
          Lade Leute ein, die nur ansehen, selbst buchen oder den Kalender mitverwalten.
        </li>
        <li>
          <strong>Datensparsam</strong>
          Kein Tracking, keine externen Dienste, nur ein technisch notwendiges Session-Cookie.
        </li>
      </ul>
    </div>
  );
}
