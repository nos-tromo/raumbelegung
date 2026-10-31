import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Recurring } from '../lib/recurrence';
import { Overview } from './Overview';

const items: (Recurring & { id: string })[] = [
  { id: 'a', title: 'Chor', date: '2026-11-01', start: '18:00', end: '20:00', rec: 'weekly' },
  { id: 'b', title: 'Yoga', date: '2026-11-01', start: '19:00', end: '20:00', rec: 'none' },
  { id: 'c', title: 'Kaffee', date: '2026-11-02', start: '09:00', end: '10:00', rec: 'none' },
];

describe('Overview', () => {
  it('marks today, tomorrow and overlaps in the 4-week view', () => {
    const { container } = render(<Overview items={items} today="2026-11-01" />);
    const days = container.querySelectorAll('.day');
    expect(days[0]).toHaveTextContent('So, 01.11.heute');
    expect(within(days[0] as HTMLElement).getAllByText('Überschneidung')).toHaveLength(2);
    expect(days[1]).toHaveTextContent('morgen');
    // weekly Chor: 4 Sundays within 28 days, plus Monday Kaffee
    expect(days).toHaveLength(5);
  });

  it('offers the current and next year and remembers open months', () => {
    const { container } = render(<Overview items={items} today="2026-11-01" />);
    fireEvent.click(screen.getByRole('button', { name: '2027' }));
    expect(screen.getByRole('button', { name: '2027' })).toHaveAttribute('aria-pressed', 'true');
    const months = container.querySelectorAll('details.month');
    expect(months).toHaveLength(12);
    // January of next year is open by default
    expect(months[0]).toHaveAttribute('open');
    expect(months[0]).toHaveTextContent('Januar 2027');
    expect(months[0]).toHaveTextContent('5 Termine an 5 Tagen');

    fireEvent.click(screen.getByRole('button', { name: '2026' }));
    const nov = container.querySelectorAll('details.month')[10]!;
    expect(nov).toHaveAttribute('open');
    expect(container.querySelectorAll('details.month')[0]).not.toHaveAttribute('open');
  });
});
