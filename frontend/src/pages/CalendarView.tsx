import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/context';
import { BookingForm } from '../components/BookingForm';
import { BookingList } from '../components/BookingList';
import { Overview } from '../components/Overview';
import { Loading, ServerError } from '../components/Status';
import { errorMessage, isApiError } from '../lib/api';
import { useBookings, useCalendar, useDeleteBooking } from '../lib/queries';
import { todayIso } from '../lib/recurrence';
import { ROLE_LABEL, type Booking } from '../lib/types';
import { NotFound } from './NotFound';

export function CalendarView() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const calendar = useCalendar(id);
  const bookings = useBookings(id);
  const del = useDeleteBooking(id);
  const [deleteError, setDeleteError] = useState<string>('');

  if (calendar.isPending) return <Loading />;
  if (calendar.isError) {
    if (isApiError(calendar.error, 404)) return <NotFound what="Kalender" />;
    return <ServerError error={calendar.error} onRetry={() => void calendar.refetch()} />;
  }

  const cal = calendar.data;
  const today = todayIso(cal.timezone);
  const canEdit = cal.role === 'owner' || cal.role === 'editor';
  const canDelete = (b: Booking) =>
    cal.role === 'owner' || (cal.role === 'editor' && !!user && b.created_by === user.id);
  const items = bookings.data ?? [];

  const onDelete = (b: Booking) => {
    setDeleteError('');
    del.mutate(b.id, {
      onError: (err) =>
        setDeleteError(`„${b.title}“ konnte nicht gelöscht werden. ${errorMessage(err)}`),
    });
  };

  return (
    <>
      <title>{`${cal.name} – Raumbelegung`}</title>
      <header className="pagehead">
        <div>
          <h1>{cal.name}</h1>
          <p className="sub">
            {cal.description || 'Prüft jede neue Buchung gegen alle wiederkehrenden Termine.'}
          </p>
        </div>
        <div className="store">
          {ROLE_LABEL[cal.role]} ·{' '}
          <Link to={`/app/c/${cal.id}/settings`}>
            {cal.role === 'owner' ? 'Einstellungen' : 'Mitglieder'}
          </Link>
        </div>
      </header>

      {bookings.isError && (
        <ServerError error={bookings.error} onRetry={() => void bookings.refetch()} />
      )}

      <div className={canEdit ? 'grid' : 'grid single'}>
        {canEdit && (
          <div className="col">
            <BookingForm
              key={cal.id}
              calendarId={cal.id}
              bookings={items}
              today={today}
              ready={bookings.isSuccess}
            />
          </div>
        )}
        <div className="col">
          {!canEdit && (
            <p className="check">
              Du kannst diesen Kalender nur ansehen. Für eigene Buchungen braucht es die Rolle
              „Bearbeiten“.
            </p>
          )}
          {bookings.isPending ? (
            <Loading label="Buchungen werden geladen …" />
          ) : (
            <>
              <Overview items={items} today={today} />
              <p className="error" role="alert">
                {deleteError}
              </p>
              <BookingList
                bookings={items}
                today={today}
                canDelete={canDelete}
                onDelete={onDelete}
                deletingId={del.isPending ? del.variables : null}
                emptyText={
                  canEdit
                    ? 'Hier erscheinen alle Serien und anstehenden Einzeltermine. Trage links die erste Buchung ein.'
                    : 'Hier erscheinen alle Serien und anstehenden Einzeltermine.'
                }
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
