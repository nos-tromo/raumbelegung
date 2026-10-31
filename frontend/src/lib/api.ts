import type {
  Booking,
  BookingIn,
  Calendar,
  CalendarRef,
  Conflict,
  Invitation,
  InvitationDetails,
  InviteRole,
  Member,
  Role,
  User,
} from './types';

export const API_BASE = '/api/v1';

/** Error body from the API: `{"detail": "CODE"}`, `{"detail": {...}}` or a 422 list. */
export type ErrorDetail = string | Record<string, unknown> | unknown[] | null;

export class ApiError extends Error {
  readonly status: number;
  readonly detail: ErrorDetail;
  /** Seconds from the Retry-After header (sent with 429), if any. */
  readonly retryAfter: number | null;

  constructor(status: number, detail: ErrorDetail, retryAfter: number | null = null) {
    super(`API ${String(status)}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }

  /** Machine-readable code, from `detail` or `detail.code`. */
  get code(): string | null {
    if (typeof this.detail === 'string') return this.detail;
    if (this.detail && !Array.isArray(this.detail) && typeof this.detail.code === 'string') {
      return this.detail.code;
    }
    return null;
  }
}

/** Status 0 = network failure (server not reachable). */
export const NETWORK_ERROR = 0;

type Body = { json: unknown } | { form: Record<string, string> } | undefined;

export interface RequestOptions {
  signal?: AbortSignal;
  /** Return the raw Response instead of parsing JSON (for downloads). */
  raw?: boolean;
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: Body,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // CSRF protection: the API rejects state-changing requests without this header.
  if (method !== 'GET') headers['X-Requested-With'] = 'XMLHttpRequest';

  let payload: BodyInit | undefined;
  if (body && 'json' in body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body.json);
  } else if (body && 'form' in body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(body.form).toString();
  }

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(NETWORK_ERROR, 'NETWORK_ERROR');
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      await readDetail(res),
      parseRetryAfter(res.headers.get('Retry-After')),
    );
  }
  if (opts.raw) return res as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Retry-After is either delay-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

async function readDetail(res: Response): Promise<ErrorDetail> {
  try {
    const data = (await res.json()) as unknown;
    if (data && typeof data === 'object' && 'detail' in data) {
      return (data as { detail: ErrorDetail }).detail;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------- Endpoints (ARCHITEKTUR.md, section 5) ---------- */

const enc = encodeURIComponent;

export const api = {
  // Auth
  register: (data: { email: string; password: string; display_name: string }) =>
    request<User>('POST', '/auth/register', { json: data }),
  requestVerifyToken: (email: string) =>
    request<void>('POST', '/auth/request-verify-token', { json: { email } }),
  verify: (token: string) => request<User>('POST', '/auth/verify', { json: { token } }),
  login: (email: string, password: string) =>
    request<void>('POST', '/auth/login', { form: { username: email, password } }),
  logout: () => request<void>('POST', '/auth/logout'),
  forgotPassword: (email: string) =>
    request<void>('POST', '/auth/forgot-password', { json: { email } }),
  resetPassword: (token: string, password: string) =>
    request<unknown>('POST', '/auth/reset-password', { json: { token, password } }),

  // Account
  me: (signal?: AbortSignal) => request<User>('GET', '/users/me', undefined, { signal }),
  updateMe: (data: { display_name: string }) => request<User>('PATCH', '/users/me', { json: data }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('POST', '/users/me/password', { json: { current_password, new_password } }),
  exportMe: () => request<Response>('GET', '/users/me/export', undefined, { raw: true }),
  deleteMe: (password: string) => request<void>('DELETE', '/users/me', { json: { password } }),

  // Calendars
  calendars: (signal?: AbortSignal) =>
    request<Calendar[]>('GET', '/calendars', undefined, { signal }),
  createCalendar: (data: { name: string; description?: string | null; timezone?: string }) =>
    request<Calendar>('POST', '/calendars', { json: data }),
  calendar: (id: string, signal?: AbortSignal) =>
    request<Calendar>('GET', `/calendars/${enc(id)}`, undefined, { signal }),
  updateCalendar: (
    id: string,
    data: { name?: string; description?: string | null; timezone?: string },
  ) => request<Calendar>('PATCH', `/calendars/${enc(id)}`, { json: data }),
  deleteCalendar: (id: string) => request<void>('DELETE', `/calendars/${enc(id)}`),

  // Members
  members: (id: string, signal?: AbortSignal) =>
    request<Member[]>('GET', `/calendars/${enc(id)}/members`, undefined, { signal }),
  updateMember: (id: string, userId: string, role: Role) =>
    request<Member>('PATCH', `/calendars/${enc(id)}/members/${enc(userId)}`, { json: { role } }),
  removeMember: (id: string, userId: string) =>
    request<void>('DELETE', `/calendars/${enc(id)}/members/${enc(userId)}`),

  // Invitations
  invitations: (id: string, signal?: AbortSignal) =>
    request<Invitation[]>('GET', `/calendars/${enc(id)}/invitations`, undefined, { signal }),
  invite: (id: string, data: { email: string; role: InviteRole }) =>
    request<Invitation>('POST', `/calendars/${enc(id)}/invitations`, { json: data }),
  revokeInvitation: (id: string, invId: string) =>
    request<void>('DELETE', `/calendars/${enc(id)}/invitations/${enc(invId)}`),
  invitation: (token: string, signal?: AbortSignal) =>
    request<InvitationDetails>('GET', `/invitations/${enc(token)}`, undefined, { signal }),
  acceptInvitation: (token: string) =>
    request<{ calendar_id: string }>('POST', `/invitations/${enc(token)}/accept`),

  // Bookings
  bookings: (id: string, signal?: AbortSignal) =>
    request<Booking[]>('GET', `/calendars/${enc(id)}/bookings`, undefined, { signal }),
  checkBooking: (id: string, data: BookingIn) =>
    request<{ conflicts: Conflict[] }>('POST', `/calendars/${enc(id)}/bookings/check`, {
      json: data,
    }),
  createBooking: (id: string, data: BookingIn & { force?: boolean }) =>
    request<Booking>('POST', `/calendars/${enc(id)}/bookings`, { json: data }),
  deleteBooking: (id: string, bookingId: string) =>
    request<void>('DELETE', `/calendars/${enc(id)}/bookings/${enc(bookingId)}`),
};

/* ---------- Error details ---------- */

/** Conflicts from a `409 BOOKING_CONFLICT`, or null. */
export function bookingConflicts(err: unknown): Conflict[] | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== 'BOOKING_CONFLICT') {
    return null;
  }
  const d = err.detail as { conflicts?: unknown };
  return Array.isArray(d.conflicts) ? (d.conflicts as Conflict[]) : [];
}

/** Calendars listed with a `409 LAST_OWNER`, if the API sent them. */
export function lastOwnerCalendars(err: unknown): CalendarRef[] {
  if (!(err instanceof ApiError) || err.code !== 'LAST_OWNER') return [];
  const d = err.detail;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return [];
  const list = (d as { calendars?: unknown }).calendars;
  if (!Array.isArray(list)) return [];
  return list.flatMap((c): CalendarRef[] => {
    if (typeof c === 'string') return [{ id: '', name: c }];
    if (c && typeof c === 'object' && 'name' in c) {
      const o = c as { id?: unknown; name?: unknown };
      return [{ id: typeof o.id === 'string' ? o.id : '', name: String(o.name) }];
    }
    return [];
  });
}

const PASSWORD_RULES =
  'Das Passwort erfüllt die Regeln nicht: mindestens 10 Zeichen, und es darf deine E-Mail-Adresse nicht enthalten.';

/** Password-policy errors carry a German `reason` from the server, shown as-is. */
const PASSWORD_CODES = new Set([
  'REGISTER_INVALID_PASSWORD',
  'RESET_PASSWORD_INVALID_PASSWORD',
  'INVALID_PASSWORD',
]);

const MESSAGES: Record<string, string> = {
  REGISTER_USER_ALREADY_EXISTS:
    'Zu dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.',
  REGISTER_INVALID_PASSWORD: PASSWORD_RULES,
  RESET_PASSWORD_INVALID_PASSWORD: PASSWORD_RULES,
  INVALID_PASSWORD: PASSWORD_RULES,
  LOGIN_BAD_CREDENTIALS: 'E-Mail-Adresse oder Passwort stimmt nicht.',
  LOGIN_USER_NOT_VERIFIED: 'Bitte bestätige zuerst deine E-Mail-Adresse.',
  VERIFY_USER_BAD_TOKEN:
    'Der Bestätigungslink ist ungültig oder abgelaufen. Fordere einen neuen an.',
  VERIFY_USER_ALREADY_VERIFIED: 'Deine E-Mail-Adresse ist bereits bestätigt.',
  RESET_PASSWORD_BAD_TOKEN:
    'Der Link zum Zurücksetzen ist ungültig oder abgelaufen. Fordere einen neuen an.',
  BAD_CURRENT_PASSWORD: 'Das Passwort stimmt nicht.',
  LAST_OWNER:
    'Du bist die einzige Person, die diesen Kalender verwaltet. Gib zuerst jemand anderem die Rolle „Verwalten“ oder lösche den Kalender.',
  ALREADY_MEMBER: 'Diese Person ist schon Mitglied des Kalenders.',
  INVITATION_EMAIL_MISMATCH:
    'Diese Einladung gilt für eine andere E-Mail-Adresse. Melde dich mit der eingeladenen Adresse an.',
  EMAIL_NOT_VERIFIED: 'Bitte bestätige zuerst deine E-Mail-Adresse.',
  BOOKING_CONFLICT: 'Der Raum ist zu dieser Zeit bereits vergeben.',
  CSRF_HEADER_MISSING: 'Die Anfrage wurde aus Sicherheitsgründen abgelehnt. Lade die Seite neu.',
  FORBIDDEN: 'Dafür fehlt dir die Berechtigung.',
  NOT_FOUND: 'Nicht gefunden – vielleicht wurde es gelöscht, oder du hast keinen Zugriff.',
  DATABASE_UNAVAILABLE:
    'Der Dienst ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.',
};

const STATUS_MESSAGES: Record<number, string> = {
  [NETWORK_ERROR]: 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.',
  401: 'Du bist nicht mehr angemeldet. Bitte melde dich erneut an.',
  403: 'Dafür fehlt dir die Berechtigung.',
  404: 'Nicht gefunden – vielleicht wurde es gelöscht, oder du hast keinen Zugriff.',
  422: 'Bitte prüfe deine Eingaben.',
};

/** 429 (RATE_LIMIT_EXCEEDED), with the wait time from Retry-After when known. */
function rateLimitMessage(retryAfter: number | null): string {
  if (retryAfter === null || retryAfter <= 0) {
    return 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.';
  }
  const wait =
    retryAfter < 90
      ? `${String(retryAfter)} Sekunden`
      : retryAfter < 5400
        ? `${String(Math.ceil(retryAfter / 60))} Minuten`
        : `${String(Math.ceil(retryAfter / 3600))} Stunden`;
  return `Zu viele Versuche. Bitte warte etwa ${wait} und versuche es dann erneut.`;
}

function passwordReason(err: ApiError): string | null {
  const d = err.detail;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const reason = (d as { reason?: unknown }).reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

/** German, user-facing message for any error thrown by `request`. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return rateLimitMessage(err.retryAfter);
    const code = err.code;
    if (code && PASSWORD_CODES.has(code)) return passwordReason(err) ?? PASSWORD_RULES;
    if (code && MESSAGES[code]) return MESSAGES[code];
    const byStatus = STATUS_MESSAGES[err.status];
    if (byStatus) return byStatus;
    if (err.status >= 500)
      return 'Da ist auf dem Server etwas schiefgelaufen. Bitte versuche es gleich noch einmal.';
  }
  return 'Das hat nicht geklappt. Bitte versuche es in einem Moment noch einmal.';
}

export const isApiError = (err: unknown, status?: number): err is ApiError =>
  err instanceof ApiError && (status === undefined || err.status === status);
