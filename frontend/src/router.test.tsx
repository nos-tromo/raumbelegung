import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from './router';
import { mockApi, renderRoutes, verifiedUser } from './test/utils';

describe('start page', () => {
  // jsdom can't scroll; <ScrollRestoration> in the layout calls window.scrollTo.
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  it('sends logged-out visitors to the login form', async () => {
    const { router } = renderRoutes(routes, '/', { user: null });
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('');
  });

  it('takes logged-in users to their calendars', async () => {
    mockApi({ 'GET /calendars': { body: [] } });
    renderRoutes(routes, '/', { user: verifiedUser });
    expect(await screen.findByRole('heading', { name: 'Deine Kalender' })).toBeInTheDocument();
  });
});
