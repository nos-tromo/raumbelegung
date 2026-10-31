import { sortForList } from '../lib/listing';
import { clock, describe } from '../lib/recurrence';
import { useArmed } from '../lib/useArmed';
import type { Booking } from '../lib/types';

interface Props {
  bookings: readonly Booking[];
  today: string;
  canDelete: (b: Booking) => boolean;
  onDelete: (b: Booking) => void;
  /** Id of the booking currently being deleted. */
  deletingId?: string | null;
  emptyText?: string;
}

/** "Alle Buchungen" with two-step delete ("Löschen" → "Wirklich löschen" for 4 s). */
export function BookingList({
  bookings,
  today,
  canDelete,
  onDelete,
  deletingId,
  emptyText,
}: Props) {
  const { armed, click } = useArmed(4000);

  const list = sortForList(bookings, today);

  return (
    <section aria-labelledby="h-all">
      <h2 id="h-all">Alle Buchungen</h2>
      {!list.length ? (
        <div className="empty">
          {emptyText ?? 'Hier erscheinen alle Serien und anstehenden Einzeltermine.'}
        </div>
      ) : (
        <ul className="series">
          {list.map((b) => {
            const isArmed = armed === b.id;
            return (
              <li key={b.id}>
                <div className="info">
                  <div className="name">{b.title}</div>
                  <div className="when">
                    {describe(b)}, <span className="time">{clock(b)}</span>
                    {b.created_by_name && <span className="by"> · von {b.created_by_name}</span>}
                  </div>
                </div>
                {canDelete(b) && (
                  <button
                    type="button"
                    className={isArmed ? 'link confirm' : 'link'}
                    onClick={() => click(b.id, () => onDelete(b))}
                    disabled={deletingId === b.id}
                    aria-label={isArmed ? `${b.title} wirklich löschen` : `${b.title} löschen`}
                  >
                    {deletingId === b.id
                      ? 'Wird gelöscht …'
                      : isArmed
                        ? 'Wirklich löschen'
                        : 'Löschen'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
