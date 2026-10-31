import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/context';
import { VerifyNotice } from '../auth/guards';
import { FormError, Loading } from '../components/Status';
import { isApiError, errorMessage } from '../lib/api';
import { useAcceptInvitation, useInvitationDetails } from '../lib/queries';
import { ROLE_HINT, ROLE_LABEL } from '../lib/types';

export function Invite() {
  const { token = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const details = useInvitationDetails(token);
  const accept = useAcceptInvitation();

  if (details.isPending) return <Loading />;
  if (details.isError) {
    const gone = isApiError(details.error, 404);
    return (
      <section className="panel narrow" aria-labelledby="h-inv">
        <title>Einladung – Raumbelegung</title>
        <h1 id="h-inv" className="h-page">
          Einladung
        </h1>
        <p className="check bad">
          <strong>{gone ? 'Einladung ungültig' : 'Laden fehlgeschlagen'}</strong>
          {gone
            ? 'Diese Einladung ist abgelaufen, wurde zurückgezogen oder schon angenommen. Bitte die Person, die dich eingeladen hat, um eine neue.'
            : errorMessage(details.error)}
        </p>
        <p className="links">
          <Link to="/app">Zu deinen Kalendern</Link>
        </p>
      </section>
    );
  }

  const inv = details.data;
  const mismatch = user && user.email.toLowerCase() !== inv.email.toLowerCase();

  return (
    <section className="panel narrow" aria-labelledby="h-inv">
      <title>{`Einladung zu ${inv.calendar_name} – Raumbelegung`}</title>
      <h1 id="h-inv" className="h-page">
        Einladung zu „{inv.calendar_name}“
      </h1>
      <p>
        {inv.invited_by_name ? <strong>{inv.invited_by_name}</strong> : 'Jemand'} lädt dich ein,
        beim Kalender <strong>{inv.calendar_name}</strong> mitzumachen.
      </p>
      <dl className="facts">
        <dt>Rolle</dt>
        <dd>
          {ROLE_LABEL[inv.role]} <span className="hint">– {ROLE_HINT[inv.role]}</span>
        </dd>
        <dt>Eingeladen ist</dt>
        <dd>{inv.email}</dd>
      </dl>
      {mismatch && (
        <p className="check bad">
          <strong>Andere E-Mail-Adresse</strong>
          Du bist als {user.email} angemeldet. Die Einladung gilt für {inv.email}. Melde dich mit
          dieser Adresse an, um sie anzunehmen.
        </p>
      )}
      {user && !user.is_verified ? (
        <VerifyNotice email={user.email} inline />
      ) : (
        <>
          <FormError error={accept.error} />
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={accept.isPending || !!mismatch}
              onClick={() =>
                accept.mutate(token, {
                  onSuccess: (r) => void navigate(`/app/c/${r.calendar_id}`, { replace: true }),
                })
              }
            >
              {accept.isPending ? 'Wird angenommen …' : 'Einladung annehmen'}
            </button>
            <Link to="/app" className="link">
              Nicht jetzt
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
