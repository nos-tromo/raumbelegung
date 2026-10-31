import {
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, api, isApiError } from './api';
import type { BookingIn, InviteRole, Role, User } from './types';

export const qk = {
  me: ['me'] as const,
  calendars: ['calendars'] as const,
  calendar: (id: string) => ['calendars', id] as const,
  members: (id: string) => ['calendars', id, 'members'] as const,
  invitations: (id: string) => ['calendars', id, 'invitations'] as const,
  bookings: (id: string) => ['calendars', id, 'bookings'] as const,
  invitation: (token: string) => ['invitation', token] as const,
};

/** Full page load: drops all cached data from memory (shared computers). */
export function hardNavigate(path: string) {
  window.location.assign(path);
}

export function createQueryClient(): QueryClient {
  const onError = (err: unknown) => {
    // Session expired: treat as logged out, guards redirect to login.
    if (isApiError(err, 401)) client.setQueryData(qk.me, null);
    // Verification state changed on the server: refetch the user.
    if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
      void client.invalidateQueries({ queryKey: qk.me });
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
  return client;
}

/* ---------- Queries ---------- */

/** Current user, or null when not logged in (401). */
export function useMe() {
  return useQuery<User | null>({
    queryKey: qk.me,
    queryFn: async ({ signal }) => {
      try {
        return await api.me(signal);
      } catch (err) {
        if (isApiError(err, 401)) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useCalendars(enabled = true) {
  return useQuery({
    queryKey: qk.calendars,
    queryFn: ({ signal }) => api.calendars(signal),
    enabled,
  });
}

export function useCalendar(id: string) {
  return useQuery({ queryKey: qk.calendar(id), queryFn: ({ signal }) => api.calendar(id, signal) });
}

export function useMembers(id: string) {
  return useQuery({ queryKey: qk.members(id), queryFn: ({ signal }) => api.members(id, signal) });
}

export function useInvitations(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.invitations(id),
    queryFn: ({ signal }) => api.invitations(id, signal),
    enabled,
  });
}

export function useBookings(id: string) {
  return useQuery({
    queryKey: qk.bookings(id),
    queryFn: ({ signal }) => api.bookings(id, signal),
    // Shared calendar: pick up other people's bookings now and then.
    refetchInterval: 60_000,
  });
}

export function useInvitationDetails(token: string, enabled = true) {
  return useQuery({
    queryKey: qk.invitation(token),
    queryFn: ({ signal }) => api.invitation(token, signal),
    enabled,
  });
}

/* ---------- Auth mutations ---------- */

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.login(email, password),
    onSuccess: async () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      await qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => api.logout(),
    onSettled: () => hardNavigate('/'),
  });
}

export function useRegister() {
  return useMutation({ mutationFn: api.register });
}

export function useRequestVerify() {
  return useMutation({ mutationFn: (email: string) => api.requestVerifyToken(email) });
}

export function useVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.verify(token),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => api.forgotPassword(email) });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      api.resetPassword(token, password),
  });
}

/* ---------- Account ---------- */

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateMe,
    onSuccess: (user) => {
      qc.setQueryData(qk.me, user);
      // Names appear in member lists and bookings.
      void qc.invalidateQueries({ queryKey: qk.calendars });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      api.changePassword(current, next),
  });
}

export function useDeleteMe() {
  return useMutation({
    mutationFn: (password: string) => api.deleteMe(password),
    onSuccess: () => hardNavigate('/'),
  });
}

/* ---------- Calendars ---------- */

export function useCreateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createCalendar,
    onSuccess: (cal) => {
      qc.setQueryData(qk.calendar(cal.id), cal);
      return qc.invalidateQueries({ queryKey: qk.calendars });
    },
  });
}

export function useUpdateCalendar(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; description?: string | null; timezone?: string }) =>
      api.updateCalendar(id, data),
    onSuccess: (cal) => {
      qc.setQueryData(qk.calendar(id), cal);
      return qc.invalidateQueries({ queryKey: qk.calendars, exact: true });
    },
  });
}

/**
 * Delete a calendar. The caller navigates away and then calls `forget()`,
 * so the open page does not refetch the deleted calendar and show a 404.
 */
export function useDeleteCalendar(id: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.deleteCalendar(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.calendars, exact: true }),
  });
  return { ...mutation, forget: () => qc.removeQueries({ queryKey: qk.calendar(id) }) };
}

/** Leave a calendar; same navigate-then-forget pattern as useDeleteCalendar. */
export function useLeaveCalendar(id: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (myId: string) => api.removeMember(id, myId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.calendars, exact: true }),
  });
  return { ...mutation, forget: () => qc.removeQueries({ queryKey: qk.calendar(id) }) };
}

/* ---------- Members and invitations ---------- */

/** Refresh this calendar (role, member count, members …) and the calendar list. */
function invalidateCalendar(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: qk.calendars, exact: true });
  return qc.invalidateQueries({ queryKey: qk.calendar(id) });
}

export function useUpdateMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.updateMember(id, userId, role),
    onSettled: () => invalidateCalendar(qc, id),
  });
}

/** Remove another member (owner only). To leave yourself, use useLeaveCalendar. */
export function useRemoveMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(id, userId),
    onSettled: () => invalidateCalendar(qc, id),
  });
}

export function useInvite(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role: InviteRole }) => api.invite(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invitations(id) }),
  });
}

export function useRevokeInvitation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invId: string) => api.revokeInvitation(id, invId),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.invitations(id) }),
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.acceptInvitation(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.calendars }),
  });
}

/* ---------- Bookings ---------- */

export function useCreateBooking(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BookingIn & { force?: boolean }) => api.createBooking(id, data),
    // Also after a 409: someone else booked meanwhile, so reload the list.
    onSettled: () => qc.invalidateQueries({ queryKey: qk.bookings(id) }),
  });
}

export function useDeleteBooking(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => api.deleteBooking(id, bookingId),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.bookings(id) }),
  });
}
