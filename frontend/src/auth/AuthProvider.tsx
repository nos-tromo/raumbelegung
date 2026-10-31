import { useMemo, type ReactNode } from 'react';
import { useMe } from '../lib/queries';
import { AuthContext, type AuthState } from './context';

/** Loads GET /users/me once; a 401 means logged out. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const { refetch } = me;
  const value = useMemo<AuthState>(
    () => ({
      user: me.data,
      isLoading: me.isPending,
      error: me.error,
      refetch: () => void refetch(),
    }),
    [me.data, me.isPending, me.error, refetch],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
