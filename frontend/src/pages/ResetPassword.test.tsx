import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RedirectIfAuthed } from '../auth/guards';
import { mockApi, renderRoutes } from '../test/utils';
import { Login } from './Login';
import { ResetPassword } from './ResetPassword';

const routes = [
  { path: '/reset-password', Component: ResetPassword },
  { Component: RedirectIfAuthed, children: [{ path: '/login', Component: Login }] },
];

function fillPasswords(pw: string) {
  fireEvent.change(screen.getByLabelText(/^Neues Passwort/, { selector: 'input' }), {
    target: { value: pw },
  });
  fireEvent.change(screen.getByLabelText('Passwort wiederholen'), { target: { value: pw } });
}

describe('ResetPassword', () => {
  it('sends the token and continues on the login page with a notice', async () => {
    const api = mockApi({ 'POST /auth/reset-password': { status: 200, body: null } });
    const { router } = renderRoutes(routes, '/reset-password?token=abc', { user: null });
    fillPasswords('ein-langes-passwort');
    await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      screen.getByText(/Aus Sicherheitsgründen wurdest du überall abgemeldet/),
    ).toBeInTheDocument();
    expect(api.calls[0]).toMatchObject({
      method: 'POST',
      path: '/auth/reset-password',
      body: { token: 'abc', password: 'ein-langes-passwort' },
    });
  });

  it('shows the server reason for a rejected password', async () => {
    mockApi({
      'POST /auth/reset-password': {
        status: 400,
        body: {
          detail: {
            code: 'RESET_PASSWORD_INVALID_PASSWORD',
            reason: 'Das Passwort darf die E-Mail-Adresse nicht enthalten.',
          },
        },
      },
    });
    renderRoutes(routes, '/reset-password?token=abc', { user: null });
    fillPasswords('anna@example.org-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das Passwort darf die E-Mail-Adresse nicht enthalten.',
    );
  });

  it('rejects a short password before calling the API', async () => {
    const api = mockApi({});
    renderRoutes(routes, '/reset-password?token=abc', { user: null });
    fillPasswords('kurz');
    await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
    expect(await screen.findByText('Mindestens 10 Zeichen')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});
