import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderRoutes, verifiedUser } from '../test/utils';
import { RedirectIfAuthed, RequireAuth, RequireVerified } from './guards';

const routes = [
  {
    Component: RequireAuth,
    children: [
      {
        path: '/app',
        Component: RequireVerified,
        children: [{ index: true, element: <p>Kalenderliste</p> }],
      },
    ],
  },
  {
    Component: RedirectIfAuthed,
    children: [{ path: '/login', element: <p>Login-Seite</p> }],
  },
  { path: '/invite/:t', element: <p>Einladung</p> },
];

describe('RequireVerified', () => {
  it('shows the notice to unverified users and resends the link', async () => {
    const api = mockApi({ 'POST /auth/request-verify-token': { status: 202, body: null } });
    renderRoutes(routes, '/app', { user: { ...verifiedUser, is_verified: false } });
    expect(
      screen.getByRole('heading', { name: 'Bitte bestätige deine E-Mail' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Kalenderliste')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Link erneut senden' }));
    await screen.findByText(/Neuer Link ist unterwegs/);
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]).toMatchObject({
      method: 'POST',
      path: '/auth/request-verify-token',
      body: { email: verifiedUser.email },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
  });

  it('lets verified users through', () => {
    renderRoutes(routes, '/app', { user: verifiedUser });
    expect(screen.getByText('Kalenderliste')).toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  it('redirects to login with the return path', async () => {
    const { router } = renderRoutes(routes, '/app?x=1', { user: null });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=' + encodeURIComponent('/app?x=1'));
    expect(screen.getByText('Login-Seite')).toBeInTheDocument();
  });
});

describe('RedirectIfAuthed', () => {
  it('sends logged-in users to ?next=', async () => {
    const { router } = renderRoutes(routes, '/login?next=%2Finvite%2Fabc', { user: verifiedUser });
    await waitFor(() => expect(router.state.location.pathname).toBe('/invite/abc'));
  });

  it('ignores external next targets', async () => {
    const { router } = renderRoutes(routes, '/login?next=%2F%2Fevil.example', {
      user: verifiedUser,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
  });
});
