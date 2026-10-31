import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { bookingConflicts, errorMessage } from '../lib/api';
import {
  bookingSchema,
  checkBooking,
  serverConflictLines,
  toBookingIn,
  type BookingFormValues,
} from '../lib/bookingCheck';
import { useCreateBooking } from '../lib/queries';
import { REC_VALUES, recLabels } from '../lib/recurrence';
import type { Booking } from '../lib/types';

interface Props {
  calendarId: string;
  bookings: readonly Booking[];
  /** Today in the calendar's time zone (YYYY-MM-DD), default for the date field. */
  today: string;
  /** False while bookings are still loading: no check, no saving yet. */
  ready?: boolean;
}

/** Result of the last save attempt, tied to the form values it was made with. */
type SaveState =
  | { kind: 'conflict'; key: string; lines: string[] }
  | { kind: 'error'; key: string; message: string };

const keyOf = (v: BookingFormValues) => JSON.stringify(toBookingIn(v));

export function BookingForm({ calendarId, bookings, today, ready = true }: Props) {
  const { register, control, handleSubmit, setValue, setFocus } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { title: '', date: today, start: '10:00', end: '12:00', rec: 'none', until: '' },
    mode: 'onChange',
  });
  const values = useWatch({ control }) as BookingFormValues;
  const create = useCreateBooking(calendarId);
  const [saved, setSaved] = useState<string>('');
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const msgTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(msgTimer.current), []);

  const check = useMemo(() => checkBooking(values, bookings), [values, bookings]);
  const labels = recLabels(values.date);

  // A server answer only counts while the form still holds the values it was for.
  const currentKey = keyOf(values);
  const server = saveState && saveState.key === currentKey ? saveState : null;
  const hasConflict = check.kind === 'conflict' || server?.kind === 'conflict';
  const canSave = check.valid && ready && !create.isPending;

  const onValid = async (v: BookingFormValues) => {
    const force = hasConflict;
    try {
      await create.mutateAsync(force ? { ...toBookingIn(v), force: true } : toBookingIn(v));
      setSaveState(null);
      setValue('title', '', { shouldValidate: false });
      setSaved(force ? 'Gespeichert, trotz Überschneidung.' : 'Buchung gespeichert.');
      window.clearTimeout(msgTimer.current);
      msgTimer.current = window.setTimeout(() => setSaved(''), 3500);
      setFocus('title');
    } catch (err) {
      setSaved('');
      const conflicts = bookingConflicts(err);
      setSaveState(
        conflicts
          ? { kind: 'conflict', key: keyOf(v), lines: serverConflictLines(conflicts) }
          : { kind: 'error', key: keyOf(v), message: errorMessage(err) },
      );
    }
  };

  let box: ReactNode;
  let boxClass = 'check';
  if (server?.kind === 'error') {
    boxClass = 'check bad';
    box = (
      <>
        <strong>Speichern fehlgeschlagen</strong>
        {server.message}
      </>
    );
  } else if (server?.kind === 'conflict') {
    boxClass = 'check bad';
    box = (
      <>
        <strong>Raum inzwischen vergeben</strong>
        Gerade eben hat jemand anderes gebucht:
        <ul>
          {server.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </>
    );
  } else if (!ready) {
    box = (
      <>
        <strong>Raumprüfung</strong>
        Buchungen werden geladen …
      </>
    );
  } else if (check.kind === 'conflict') {
    boxClass = 'check bad';
    box = (
      <>
        <strong>{check.heading}</strong>
        <ul>
          {check.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </>
    );
  } else {
    if (check.kind === 'ok') boxClass = 'check ok';
    if (check.kind === 'bad') boxClass = 'check bad';
    box = (
      <>
        <strong>{check.heading}</strong>
        {check.text}
      </>
    );
  }

  return (
    <section className="panel" aria-labelledby="h-new">
      <h2 id="h-new">Neue Buchung</h2>
      <form noValidate onSubmit={(e) => void handleSubmit(onValid)(e)}>
        <label htmlFor="bf-title">
          Veranstaltung
          <input
            id="bf-title"
            type="text"
            maxLength={80}
            placeholder="z. B. Kartenspielen"
            autoComplete="off"
            {...register('title')}
          />
        </label>
        <label htmlFor="bf-date">
          Datum (bei Serien der erste Termin)
          <input id="bf-date" type="date" {...register('date')} />
        </label>
        <div className="row2">
          <label htmlFor="bf-start">
            Von
            <input id="bf-start" type="time" {...register('start')} />
          </label>
          <label htmlFor="bf-end">
            Bis
            <input id="bf-end" type="time" {...register('end')} />
          </label>
        </div>
        <label htmlFor="bf-rec">
          Wiederholung
          <select id="bf-rec" {...register('rec')}>
            {REC_VALUES.map((r) => (
              <option key={r} value={r}>
                {labels[r]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="bf-until" hidden={values.rec === 'none'}>
          Serie endet am (optional)
          <input id="bf-until" type="date" min={values.date || undefined} {...register('until')} />
        </label>
        <div className={boxClass} role="status" aria-live="polite" data-testid="check">
          {box}
        </div>
        <button className={hasConflict ? 'btn warn' : 'btn'} type="submit" disabled={!canSave}>
          {create.isPending
            ? 'Wird gespeichert …'
            : hasConflict
              ? 'Trotzdem speichern'
              : 'Buchung speichern'}
        </button>
        <p className="msg" role="status">
          {saved}
        </p>
        <p className="hint">
          Serien werden für die nächsten 24 Monate ab dem ersten Termin geprüft.
        </p>
      </form>
    </section>
  );
}
