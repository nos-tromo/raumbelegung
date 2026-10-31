import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Booking } from '../lib/types';
import { mockApi, renderWithProviders, verifiedUser } from '../test/utils';
import { BookingForm } from './BookingForm';

const tuesday: Booking = {
  id: 'tue',
  title: 'Spielenachmittag',
  date: '2026-11-03',
  start: '14:00',
  end: '17:00',
  rec: 'weekly',
  until: null,
  created_by: 'u-2',
  created_by_name: 'Ben',
  created_at: '2026-10-01T10:00:00Z',
};

function setup(bookings: Booking[] = [tuesday], handlers: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi(handlers);
  const utils = renderWithProviders(
    <BookingForm calendarId="cal-1" bookings={bookings} today="2026-11-01" />,
    { user: verifiedUser },
  );
  const fill = (v: {
    title?: string;
    date?: string;
    start?: string;
    end?: string;
    rec?: string;
  }) => {
    if (v.title !== undefined)
      fireEvent.change(screen.getByLabelText('Veranstaltung'), { target: { value: v.title } });
    if (v.date !== undefined)
      fireEvent.change(screen.getByLabelText(/^Datum/), { target: { value: v.date } });
    if (v.start !== undefined)
      fireEvent.change(screen.getByLabelText('Von'), { target: { value: v.start } });
    if (v.end !== undefined)
      fireEvent.change(screen.getByLabelText('Bis'), { target: { value: v.end } });
    if (v.rec !== undefined)
      fireEvent.change(screen.getByLabelText('Wiederholung'), { target: { value: v.rec } });
  };
  return { ...utils, api, fill, check: () => screen.getByTestId('check') };
}

describe('BookingForm', () => {
  it('asks for input first and disables saving', () => {
    const { check } = setup();
    expect(check()).toHaveTextContent('Raumprüfung');
    expect(screen.getByRole('button', { name: 'Buchung speichern' })).toBeDisabled();
  });

  it('shows "Raum bereits vergeben" for a conflicting booking', async () => {
    const { fill, check } = setup();
    fill({ title: 'Chor', date: '2026-12-15', start: '16:00', end: '18:00' });
    await waitFor(() => expect(check()).toHaveTextContent('Raum bereits vergeben'));
    expect(check()).toHaveClass('check', 'bad');
    expect(check()).toHaveTextContent(
      'Spielenachmittag (jeden Dienstag, 14:00–17:00): am Di, 15.12.2026',
    );
    expect(screen.getByRole('button', { name: 'Trotzdem speichern' })).toBeEnabled();
  });

  it('counts conflicting dates of a series', async () => {
    const { fill, check } = setup();
    fill({ title: 'Kurs', date: '2026-11-10', start: '16:00', end: '18:00', rec: 'weekly' });
    await waitFor(() => expect(check()).toHaveTextContent(/Termine, erstmals am Di, 10\.11\.2026/));
  });

  it('shows "Raum frei" and saves without force', async () => {
    const { fill, check, api } = setup([tuesday], {
      'POST /calendars/cal-1/bookings': (c) => ({
        status: 201,
        body: { ...tuesday, ...(c.body as object), id: 'new' },
      }),
      'GET /calendars/cal-1/bookings': { body: [tuesday] },
    });
    fill({ title: 'Chor', date: '2026-12-15', start: '17:00', end: '19:00' });
    await waitFor(() => expect(check()).toHaveTextContent('Raum frei'));
    expect(check()).toHaveClass('ok');
    await userEvent.click(screen.getByRole('button', { name: 'Buchung speichern' }));
    await screen.findByText('Buchung gespeichert.');
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      title: 'Chor',
      date: '2026-12-15',
      start: '17:00',
      end: '19:00',
      rec: 'none',
    });
    expect(post.headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(screen.getByLabelText('Veranstaltung')).toHaveValue('');
  });

  it('sends force: true after "Trotzdem speichern"', async () => {
    const { fill, api } = setup([tuesday], {
      'POST /calendars/cal-1/bookings': { status: 201, body: { ...tuesday, id: 'new' } },
      'GET /calendars/cal-1/bookings': { body: [tuesday] },
    });
    fill({ title: 'Chor', date: '2026-12-15', start: '16:00', end: '18:00' });
    await userEvent.click(await screen.findByRole('button', { name: 'Trotzdem speichern' }));
    await screen.findByText('Gespeichert, trotz Überschneidung.');
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ force: true });
  });

  it('shows the server conflicts on a 409 race and offers to save anyway', async () => {
    const other: Booking = {
      ...tuesday,
      id: 'x',
      title: 'Yoga',
      date: '2026-12-15',
      rec: 'none',
      start: '17:30',
      end: '18:30',
    };
    const { fill, check } = setup([tuesday], {
      'POST /calendars/cal-1/bookings': {
        status: 409,
        body: {
          detail: {
            code: 'BOOKING_CONFLICT',
            conflicts: [{ booking: other, dates: ['2026-12-15'] }],
          },
        },
      },
      'GET /calendars/cal-1/bookings': { body: [tuesday] },
    });
    fill({ title: 'Chor', date: '2026-12-15', start: '17:00', end: '19:00' });
    await userEvent.click(await screen.findByRole('button', { name: 'Buchung speichern' }));
    await waitFor(() => expect(check()).toHaveTextContent('Raum inzwischen vergeben'));
    expect(check()).toHaveTextContent('Yoga (Di, 15.12.2026, 17:30–18:30): am Di, 15.12.2026');
    expect(screen.getByRole('button', { name: 'Trotzdem speichern' })).toBeEnabled();
  });

  it('rejects an end before the start', async () => {
    const { fill, check } = setup();
    fill({ title: 'Chor', date: '2026-12-15', start: '18:00', end: '17:00' });
    await waitFor(() => expect(check()).toHaveTextContent('Uhrzeit prüfen'));
    expect(screen.getByRole('button', { name: 'Buchung speichern' })).toBeDisabled();
  });

  it('labels the repeat options after the chosen date and shows "Serie endet am" for series', async () => {
    const { fill } = setup();
    expect(
      screen.getByLabelText(/Serie endet am/, { selector: 'input' }).closest('label'),
    ).not.toBeVisible();
    fill({ date: '2026-11-25', rec: 'monthlyLast' });
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Wöchentlich (jeden Mittwoch)' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('option', { name: 'Monatlich (jeden 4. Mittwoch)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Monatlich (jeden letzten Mittwoch)' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Serie endet am/)).toBeVisible();
  });
});
