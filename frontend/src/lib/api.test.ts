import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/utils';
import {
  ApiError,
  api,
  bookingConflicts,
  errorMessage,
  lastOwnerCalendars,
  parseRetryAfter,
  type ErrorDetail,
} from './api';

describe('api', () => {
  it('sends the CSRF header on every non-GET and uses same-origin credentials', async () => {
    const { fetchMock } = mockApi({
      'GET /calendars': { body: [] },
      'DELETE /calendars/c1': { status: 204 },
    });
    await api.calendars();
    await api.deleteCalendar('c1');
    const [getUrl, getInit] = fetchMock.mock.calls[0]!;
    const [, delInit] = fetchMock.mock.calls[1]!;
    expect(getUrl).toBe('/api/v1/calendars');
    expect(getInit!.credentials).toBe('same-origin');
    expect((getInit!.headers as Record<string, string>)['X-Requested-With']).toBeUndefined();
    expect((delInit!.headers as Record<string, string>)['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('logs in with a urlencoded form', async () => {
    const { calls } = mockApi({ 'POST /auth/login': { status: 204 } });
    await api.login('anna@example.org', 'geheim & sicher');
    expect(calls[0]!.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(calls[0]!.body).toBe('username=anna%40example.org&password=geheim+%26+sicher');
  });

  it('parses errors into ApiError with status and detail', async () => {
    mockApi({ 'POST /auth/login': { status: 400, body: { detail: 'LOGIN_BAD_CREDENTIALS' } } });
    const err = await api.login('a@b.de', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      detail: 'LOGIN_BAD_CREDENTIALS',
      code: 'LOGIN_BAD_CREDENTIALS',
    });
    expect(errorMessage(err)).toBe('E-Mail-Adresse oder Passwort stimmt nicht.');
  });

  it.each([
    [400, { code: 'REGISTER_INVALID_PASSWORD' }, /mindestens 10 Zeichen/],
    [400, 'REGISTER_USER_ALREADY_EXISTS', /schon ein Konto/],
    [400, 'VERIFY_USER_BAD_TOKEN', /Bestätigungslink ist ungültig/],
    [400, 'VERIFY_USER_ALREADY_VERIFIED', /bereits bestätigt/],
    [400, 'RESET_PASSWORD_BAD_TOKEN', /Zurücksetzen ist ungültig/],
    [400, 'BAD_CURRENT_PASSWORD', /Passwort stimmt nicht/],
    [409, 'LAST_OWNER', /einzige Person/],
    [409, 'ALREADY_MEMBER', /schon Mitglied/],
    [403, 'INVITATION_EMAIL_MISMATCH', /andere E-Mail-Adresse/],
    [403, 'EMAIL_NOT_VERIFIED', /bestätige zuerst/],
    [429, 'RATE_LIMIT_EXCEEDED', /^Zu viele Versuche\. Bitte warte kurz/],
    [403, 'FORBIDDEN', /fehlt dir die Berechtigung/],
    [404, 'NOT_FOUND', /Nicht gefunden/],
    [503, 'DATABASE_UNAVAILABLE', /nicht erreichbar/],
    [
      422,
      [{ loc: ['body'], msg: 'Value error, end must be after start', type: 'value_error' }],
      /prüfe deine Eingaben/,
    ],
    [500, null, /Server etwas schiefgelaufen/],
    [0, 'NETWORK_ERROR', /Keine Verbindung/],
  ] as const)('maps %s %j to German', (status, detail, expected) => {
    expect(errorMessage(new ApiError(status, detail as ErrorDetail))).toMatch(expected);
  });

  it.each([
    ['REGISTER_INVALID_PASSWORD', 'Das Passwort muss mindestens 10 Zeichen lang sein.'],
    ['INVALID_PASSWORD', 'Das Passwort darf die E-Mail-Adresse nicht enthalten.'],
    ['RESET_PASSWORD_INVALID_PASSWORD', 'Das Passwort muss mindestens 10 Zeichen lang sein.'],
  ])('shows the server reason for %s', (code, reason) => {
    expect(errorMessage(new ApiError(400, { code, reason }))).toBe(reason);
  });

  it('uses Retry-After for the rate-limit message', async () => {
    mockApi({
      'POST /calendars/c1/invitations': {
        status: 429,
        body: { detail: 'RATE_LIMIT_EXCEEDED' },
        headers: { 'Retry-After': '1200' },
      },
      'DELETE /users/me': {
        status: 429,
        body: { detail: 'RATE_LIMIT_EXCEEDED' },
        headers: { 'Retry-After': '30' },
      },
    });
    const invite = await api
      .invite('c1', { email: 'x@y.de', role: 'viewer' })
      .catch((e: unknown) => e);
    expect(invite).toMatchObject({ status: 429, retryAfter: 1200 });
    expect(errorMessage(invite)).toBe(
      'Zu viele Versuche. Bitte warte etwa 20 Minuten und versuche es dann erneut.',
    );
    const del = await api.deleteMe('pw').catch((e: unknown) => e);
    expect(errorMessage(del)).toBe(
      'Zu viele Versuche. Bitte warte etwa 30 Sekunden und versuche es dann erneut.',
    );
  });

  it('parses Retry-After as seconds or HTTP date', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    expect(parseRetryAfter('120', now)).toBe(120);
    expect(parseRetryAfter('Sat, 31 Oct 2026 12:05:00 GMT', now)).toBe(300);
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });

  it('reads booking conflicts and last-owner calendars', () => {
    const conflict = new ApiError(409, {
      code: 'BOOKING_CONFLICT',
      conflicts: [{ booking: { id: 'x' }, dates: ['2026-11-03'] }],
    });
    expect(bookingConflicts(conflict)).toHaveLength(1);
    expect(bookingConflicts(new ApiError(409, 'LAST_OWNER'))).toBeNull();
    const lo = new ApiError(409, {
      code: 'LAST_OWNER',
      calendars: [{ id: 'c1', name: 'Saal' }, 'Keller'],
    });
    expect(lastOwnerCalendars(lo)).toEqual([
      { id: 'c1', name: 'Saal' },
      { id: '', name: 'Keller' },
    ]);
  });

  it('turns network failures into status 0', async () => {
    const { fetchMock } = mockApi({});
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.me()).rejects.toMatchObject({ status: 0 });
  });
});
