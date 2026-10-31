import { createContext, useContext } from 'react';
import type { User } from '../lib/types';

export interface AuthState {
  /** null = not logged in, undefined = still loading */
  user: User | null | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Only allow same-site relative return paths (no open redirect). */
export function safeNext(next: string | null | undefined, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}

export function loginPathFor(location: { pathname: string; search: string; hash: string }): string {
  const next = location.pathname + location.search + location.hash;
  // After login the default target is /app anyway, so it needs no ?next=.
  return next === '/app' ? '/login' : '/login?next=' + encodeURIComponent(next);
}
