import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../auth/context';
import { SelectField, TextField } from '../components/Field';
import { FormError, Loading, ServerError } from '../components/Status';
import { errorMessage, isApiError } from '../lib/api';
import {
  useCalendar,
  useDeleteCalendar,
  useInvitations,
  useInvite,
  useLeaveCalendar,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateCalendar,
  useUpdateMember,
} from '../lib/queries';
import { email } from '../lib/schemas';
import { timeZones } from '../lib/timezones';
import { ROLE_HINT, ROLE_LABEL, type Calendar, type Role } from '../lib/types';
import { useArmed } from '../lib/useArmed';
import { NotFound } from './NotFound';

const ROLES: Role[] = ['owner', 'editor', 'viewer'];

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const fmtDateTime = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : dateFmt.format(d);
};

/* ---------- Name, description, time zone ---------- */

const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Namen eintragen').max(80, 'Höchstens 80 Zeichen'),
  description: z.string().trim().max(500, 'Höchstens 500 Zeichen'),
  timezone: z.string().min(1),
});
type DetailsValues = z.infer<typeof detailsSchema>;

function DetailsForm({ cal }: { cal: Calendar }) {
  const update = useUpdateCalendar(cal.id);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: cal.name, description: cal.description ?? '', timezone: cal.timezone },
  });

  const onSubmit = (v: DetailsValues) => {
    setSaved(false);
    update.mutate(
      { name: v.name, description: v.description || null, timezone: v.timezone },
      {
        onSuccess: (c) => {
          reset({ name: c.name, description: c.description ?? '', timezone: c.timezone });
          setSaved(true);
        },
      },
    );
  };

  return (
    <section className="panel" aria-labelledby="h-details">
      <h2 id="h-details">Kalender</h2>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <TextField label="Name" maxLength={80} error={errors.name?.message} {...register('name')} />
        <TextField
          label="Beschreibung (optional)"
          maxLength={500}
          error={errors.description?.message}
          {...register('description')}
        />
        <SelectField
          label="Zeitzone"
          hint="Bestimmt, welcher Tag „heute“ ist."
          {...register('timezone')}
        >
          {timeZones(cal.timezone).map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll('_', ' ')}
            </option>
          ))}
        </SelectField>
        <FormError error={update.error} />
        <button className="btn" type="submit" disabled={update.isPending || !isDirty}>
          {update.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
        </button>
        <p className="msg" role="status">
          {saved && !isDirty ? 'Gespeichert.' : ''}
        </p>
      </form>
    </section>
  );
}

/* ---------- Members ---------- */

function Members({ cal, isOwner, myId }: { cal: Calendar; isOwner: boolean; myId: string }) {
  const members = useMembers(cal.id);
  const updateRole = useUpdateMember(cal.id);
  const remove = useRemoveMember(cal.id);
  const { armed, click } = useArmed(4000);
  const [error, setError] = useState('');

  return (
    <section aria-labelledby="h-members">
      <h2 id="h-members">Mitglieder</h2>
      {members.isPending ? (
        <Loading />
      ) : members.isError ? (
        <ServerError error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <ul className="series">
          {members.data.map((m) => {
            const me = m.user_id === myId;
            return (
              <li key={m.user_id}>
                <div className="info">
                  <div className="name">
                    {m.display_name || m.email}
                    {me && <span className="tag">du</span>}
                  </div>
                  <div className="when">{m.email}</div>
                </div>
                {isOwner ? (
                  <div className="member-actions">
                    <label className="inline">
                      <span className="sr-only">Rolle von {m.display_name || m.email}</span>
                      <select
                        value={m.role}
                        disabled={updateRole.isPending}
                        onChange={(e) => {
                          setError('');
                          updateRole.mutate(
                            { userId: m.user_id, role: e.target.value as Role },
                            { onError: (err) => setError(errorMessage(err)) },
                          );
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!me && (
                      <button
                        type="button"
                        className={armed === m.user_id ? 'link confirm' : 'link'}
                        disabled={remove.isPending}
                        onClick={() =>
                          click(m.user_id, () => {
                            setError('');
                            remove.mutate(m.user_id, {
                              onError: (err) => setError(errorMessage(err)),
                            });
                          })
                        }
                      >
                        {armed === m.user_id ? 'Wirklich entfernen' : 'Entfernen'}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="tag">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="error" role="alert">
        {error}
      </p>
      <dl className="roles hint">
        {ROLES.map((r) => (
          <div key={r}>
            <dt>{ROLE_LABEL[r]}</dt>
            <dd>{ROLE_HINT[r]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------- Invitations ---------- */

const inviteSchema = z.object({ email, role: z.enum(['editor', 'viewer']) });
type InviteValues = z.infer<typeof inviteSchema>;

function InviteForm({ cal }: { cal: Calendar }) {
  const invite = useInvite(cal.id);
  const [sentTo, setSentTo] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'editor' },
  });

  return (
    <section className="panel" aria-labelledby="h-invite">
      <h2 id="h-invite">Einladen</h2>
      <form
        noValidate
        onSubmit={handleSubmit((v) => {
          setSentTo('');
          invite.mutate(v, {
            onSuccess: (inv) => {
              setSentTo(inv.email);
              reset({ email: '', role: v.role });
            },
          });
        })}
      >
        <TextField
          label="E-Mail-Adresse"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <SelectField label="Rolle" {...register('role')}>
          <option value="editor">{ROLE_LABEL.editor}</option>
          <option value="viewer">{ROLE_LABEL.viewer}</option>
        </SelectField>
        <FormError error={invite.error} />
        <button className="btn" type="submit" disabled={invite.isPending}>
          {invite.isPending ? 'Wird gesendet …' : 'Einladung senden'}
        </button>
        <p className="msg" role="status">
          {sentTo ? `Einladung an ${sentTo} verschickt. Sie ist 7 Tage gültig.` : ''}
        </p>
        <p className="hint">
          Lädst du dieselbe Adresse noch einmal ein, gilt nur die neue Einladung.
        </p>
      </form>
    </section>
  );
}

function OpenInvitations({ cal }: { cal: Calendar }) {
  const invitations = useInvitations(cal.id);
  const revoke = useRevokeInvitation(cal.id);
  const { armed, click } = useArmed(4000);

  return (
    <section aria-labelledby="h-invs">
      <h2 id="h-invs">Offene Einladungen</h2>
      {invitations.isPending ? (
        <Loading />
      ) : invitations.isError ? (
        <ServerError error={invitations.error} onRetry={() => void invitations.refetch()} />
      ) : !invitations.data.length ? (
        <div className="empty">Keine offenen Einladungen.</div>
      ) : (
        <ul className="series">
          {invitations.data.map((inv) => (
            <li key={inv.id}>
              <div className="info">
                <div className="name">{inv.email}</div>
                <div className="when">
                  {ROLE_LABEL[inv.role]} · gültig bis {fmtDateTime(inv.expires_at)}
                </div>
              </div>
              <button
                type="button"
                className={armed === inv.id ? 'link confirm' : 'link'}
                disabled={revoke.isPending}
                onClick={() => click(inv.id, () => revoke.mutate(inv.id))}
              >
                {armed === inv.id ? 'Wirklich zurückziehen' : 'Zurückziehen'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormError error={revoke.error} />
    </section>
  );
}

/* ---------- Leave and delete ---------- */

function Leave({ cal, myId }: { cal: Calendar; myId: string }) {
  const leave = useLeaveCalendar(cal.id);
  const navigate = useNavigate();
  const { armed, click } = useArmed(4000);
  return (
    <section className="panel danger" aria-labelledby="h-leave">
      <h2 id="h-leave">Kalender verlassen</h2>
      <p>
        Du verlierst den Zugriff auf „{cal.name}“. Deine Buchungen bleiben im Kalender. Zurück
        kommst du nur mit einer neuen Einladung.
      </p>
      <FormError error={leave.error} />
      <button
        type="button"
        className={armed === 'leave' ? 'btn warn' : 'btn ghost'}
        disabled={leave.isPending}
        onClick={() =>
          click('leave', () =>
            leave.mutate(myId, {
              onSuccess: () => {
                void Promise.resolve(navigate('/app', { replace: true })).then(() =>
                  leave.forget(),
                );
              },
            }),
          )
        }
      >
        {armed === 'leave' ? 'Wirklich verlassen' : 'Kalender verlassen'}
      </button>
    </section>
  );
}

function DeleteCalendar({ cal }: { cal: Calendar }) {
  const del = useDeleteCalendar(cal.id);
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === cal.name.trim();
  return (
    <section className="panel danger" aria-labelledby="h-delete">
      <h2 id="h-delete">Kalender löschen</h2>
      <p>
        Löscht den Kalender mit allen Buchungen, Mitgliedschaften und Einladungen. Das lässt sich
        nicht rückgängig machen.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!matches) return;
          del.mutate(undefined, {
            onSuccess: () => {
              void Promise.resolve(navigate('/app', { replace: true })).then(() => del.forget());
            },
          });
        }}
      >
        <TextField
          label={
            <>
              Zum Bestätigen den Namen eintippen: <strong className="mono">{cal.name}</strong>
            </>
          }
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <FormError error={del.error} />
        <button className="btn warn" type="submit" disabled={!matches || del.isPending}>
          {del.isPending ? 'Wird gelöscht …' : 'Kalender endgültig löschen'}
        </button>
      </form>
    </section>
  );
}

/* ---------- Page ---------- */

export function CalendarSettings() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const calendar = useCalendar(id);

  if (calendar.isPending) return <Loading />;
  if (calendar.isError) {
    if (isApiError(calendar.error, 404)) return <NotFound what="Kalender" />;
    return <ServerError error={calendar.error} onRetry={() => void calendar.refetch()} />;
  }
  const cal = calendar.data;
  const isOwner = cal.role === 'owner';
  const myId = user?.id ?? '';

  return (
    <>
      <title>{`${isOwner ? 'Einstellungen' : 'Mitglieder'}: ${cal.name} – Raumbelegung`}</title>
      <header className="pagehead">
        <div>
          <p className="crumb">
            <Link to={`/app/c/${cal.id}`}>← {cal.name}</Link>
          </p>
          <h1>{isOwner ? 'Einstellungen' : 'Mitglieder'}</h1>
          <p className="sub">
            Deine Rolle: {ROLE_LABEL[cal.role]} – {ROLE_HINT[cal.role]}.
          </p>
        </div>
      </header>
      <div className="grid">
        <div className="col">
          {isOwner && <DetailsForm key={cal.id} cal={cal} />}
          {isOwner && <InviteForm cal={cal} />}
          <Leave cal={cal} myId={myId} />
          {isOwner && <DeleteCalendar cal={cal} />}
        </div>
        <div className="col">
          <Members cal={cal} isOwner={isOwner} myId={myId} />
          {isOwner && <OpenInvitations cal={cal} />}
        </div>
      </div>
    </>
  );
}
