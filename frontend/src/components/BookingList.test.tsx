import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Booking } from '../lib/types';
import { BookingList } from './BookingList';

const base: Omit<Booking, 'id' | 'title' | 'date' | 'rec'> = {
  start: '10:00',
  end: '12:00',
  until: null,
  created_by: 'u-1',
  created_by_name: 'Anna',
  created_at: '2026-10-01T10:00:00Z',
};
const items: Booking[] = [
  { ...base, id: 'past', title: 'Vergangen', date: '2026-10-01', rec: 'none' },
  { ...base, id: 'single', title: 'Einzeltermin', date: '2026-11-20', rec: 'none' },
  {
    ...base,
    id: 'fri',
    title: 'Freitagsrunde',
    date: '2026-11-06',
    rec: 'weekly',
    created_by: 'u-2',
    created_by_name: 'Ben',
  },
  { ...base, id: 'mon', title: 'Montagstreff', date: '2026-11-02', rec: 'weekly' },
  {
    ...base,
    id: 'daily',
    title: 'Frühstück',
    date: '2026-11-02',
    rec: 'daily',
    start: '08:00',
    end: '09:00',
  },
];

describe('BookingList', () => {
  it('lists series first (daily, Mon … Sun), then upcoming single dates, with creator', () => {
    render(
      <BookingList
        bookings={items}
        today="2026-11-01"
        canDelete={() => false}
        onDelete={() => {}}
      />,
    );
    const names = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.name')!.textContent);
    expect(names).toEqual(['Frühstück', 'Montagstreff', 'Freitagsrunde', 'Einzeltermin']);
    expect(screen.getByText(/von Ben/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('deletes only after a second click within 4 seconds', async () => {
    vi.useFakeTimers();
    const onDelete = vi.fn();
    render(
      <BookingList
        bookings={items}
        today="2026-11-01"
        canDelete={(b) => b.created_by === 'u-1'}
        onDelete={onDelete}
      />,
    );
    // Ben's booking has no delete button for this editor.
    expect(screen.queryByRole('button', { name: 'Freitagsrunde löschen' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Montagstreff löschen' }));
    expect(screen.getByRole('button', { name: 'Montagstreff wirklich löschen' })).toHaveTextContent(
      'Wirklich löschen',
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(screen.getByRole('button', { name: 'Montagstreff löschen' })).toHaveTextContent(
      'Löschen',
    );
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Montagstreff löschen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Montagstreff wirklich löschen' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'mon' }));
    vi.useRealTimers();
  });
});
