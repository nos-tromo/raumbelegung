import { Link, NavLink, Outlet, ScrollRestoration, useMatch, useNavigate } from 'react-router';
import { useAuth } from '../auth/context';
import { useCalendars, useLogout } from '../lib/queries';

function CalendarSwitch() {
  const navigate = useNavigate();
  const match = useMatch('/app/c/:id/*');
  const calendars = useCalendars();
  const list = calendars.data ?? [];
  if (list.length < 2) return null;
  const current = match?.params.id ?? '';
  return (
    <label className="switch">
      <span className="sr-only">Kalender wechseln</span>
      <select
        value={list.some((c) => c.id === current) ? current : ''}
        onChange={(e) => {
          if (e.target.value) void navigate(`/app/c/${e.target.value}`);
        }}
      >
        <option value="" disabled>
          Kalender wählen …
        </option>
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const { user } = useAuth();
  const logout = useLogout();

  return (
    <div className="wrap">
      <a className="skip" href="#main">
        Zum Inhalt springen
      </a>
      <header className="site">
        <Link to={user ? '/app' : '/'} className="brand">
          Raumbelegung
        </Link>
        {user && (
          <nav aria-label="Hauptnavigation" className="nav">
            {user.is_verified && <CalendarSwitch />}
            <NavLink to="/app" end>
              Kalender
            </NavLink>
            <NavLink to="/account" title={user.email}>
              {user.display_name || 'Konto'}
            </NavLink>
            <button
              type="button"
              className="link"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              Abmelden
            </button>
          </nav>
        )}
        {user === null && (
          <nav aria-label="Hauptnavigation" className="nav">
            <NavLink to="/login">Anmelden</NavLink>
            <NavLink to="/register">Registrieren</NavLink>
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site">
        <Link to="/impressum">Impressum</Link>
        <span aria-hidden="true">·</span>
        <Link to="/datenschutz">Datenschutz</Link>
      </footer>
      <ScrollRestoration />
    </div>
  );
}
