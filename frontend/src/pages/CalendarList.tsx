import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../auth/context';
import { TextField } from '../components/Field';
import { FormError, Loading, ServerError } from '../components/Status';
import { useCalendars, useCreateCalendar } from '../lib/queries';
import { browserTimeZone } from '../lib/timezones';
import { ROLE_LABEL } from '../lib/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Namen eintragen').max(80, 'Höchstens 80 Zeichen'),
  description: z.string().trim().max(500, 'Höchstens 500 Zeichen'),
});
type Values = z.infer<typeof schema>;

export function CalendarList() {
  const { user } = useAuth();
  const calendars = useCalendars();
  const create = useCreateCalendar();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  });

  const onSubmit = (v: Values) =>
    create.mutate(
      { name: v.name, description: v.description || null, timezone: browserTimeZone() },
      { onSuccess: (cal) => void navigate(`/app/c/${cal.id}`) },
    );

  return (
    <>
      <title>Deine Kalender – Raumbelegung</title>
      <header className="pagehead">
        <div>
          <h1>Deine Kalender</h1>
          <p className="sub">
            Hallo {user?.display_name}. Ein Kalender steht für einen Raum, den ihr gemeinsam belegt.
          </p>
        </div>
      </header>
      <div className="grid">
        <div className="col">
          <section className="panel" aria-labelledby="h-newcal">
            <h2 id="h-newcal">Neuer Kalender</h2>
            <form noValidate onSubmit={handleSubmit(onSubmit)}>
              <TextField
                label="Name"
                placeholder="z. B. Gemeinschaftsraum"
                maxLength={80}
                autoComplete="off"
                error={errors.name?.message}
                {...register('name')}
              />
              <TextField
                label="Beschreibung (optional)"
                placeholder="z. B. Erdgeschoss, bis 20 Personen"
                maxLength={500}
                autoComplete="off"
                error={errors.description?.message}
                {...register('description')}
              />
              <FormError error={create.error} />
              <button className="btn" type="submit" disabled={create.isPending}>
                {create.isPending ? 'Wird angelegt …' : 'Kalender anlegen'}
              </button>
              <p className="hint">Du verwaltest den neuen Kalender und kannst andere einladen.</p>
            </form>
          </section>
        </div>
        <div className="col">
          <section aria-labelledby="h-cals">
            <h2 id="h-cals">Kalender</h2>
            {calendars.isPending ? (
              <Loading />
            ) : calendars.isError ? (
              <ServerError error={calendars.error} onRetry={() => void calendars.refetch()} />
            ) : !calendars.data.length ? (
              <div className="empty">
                Du bist noch in keinem Kalender. Leg links einen an, oder lass dich einladen.
              </div>
            ) : (
              <ul className="series">
                {calendars.data.map((c) => (
                  <li key={c.id}>
                    <div className="info">
                      <Link to={`/app/c/${c.id}`} className="name">
                        {c.name}
                      </Link>
                      <div className="when">
                        {c.description ? `${c.description} · ` : ''}
                        {c.member_count === 1
                          ? '1 Mitglied'
                          : `${String(c.member_count)} Mitglieder`}
                      </div>
                    </div>
                    <span className="tag">{ROLE_LABEL[c.role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
