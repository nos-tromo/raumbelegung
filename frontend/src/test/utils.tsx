import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/context';
import type { User } from '../lib/types';

export const verifiedUser: User = {
  id: 'u-1',
  email: 'anna@example.org',
  display_name: 'Anna',
  is_verified: true,
};

export interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}
type Handler = (call: Call) => Reply;

/**
 * Replaces global fetch. Handlers are keyed "METHOD /path" (path without /api/v1).
 * Unknown requests answer 404 so tests fail loudly.
 */
export function mockApi(handlers: Record<string, Handler | Reply>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^.*\/api\/v1/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    let body: unknown = init.body;
    if (typeof body === 'string' && headers['Content-Type'] === 'application/json') {
      body = JSON.parse(body);
    }
    const call = { method, path, headers, body };
    calls.push(call);
    const h = handlers[`${method} ${path}`];
    const res: Reply =
      typeof h === 'function' ? h(call) : (h ?? { status: 404, body: { detail: 'Not Found' } });
    const status = res.status ?? 200;
    const text = res.body === undefined ? null : JSON.stringify(res.body);
    return Promise.resolve(
      new Response(status === 204 ? null : text, {
        status,
        headers: { 'Content-Type': 'application/json', ...res.headers },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
}

export function authState(user: User | null): AuthState {
  return { user, isLoading: false, error: null, refetch: () => undefined };
}

export function Providers({
  children,
  user = verifiedUser,
  client = testQueryClient(),
}: {
  children: ReactNode;
  user?: User | null;
  client?: QueryClient;
}) {
  return (
    <QueryClientProvider client={client}>
      <AuthContext value={authState(user)}>{children}</AuthContext>
    </QueryClientProvider>
  );
}

/** Render a component inside providers (no router). */
export function renderWithProviders(
  ui: ReactElement,
  opts: { user?: User | null; client?: QueryClient } = {},
) {
  const client = opts.client ?? testQueryClient();
  return {
    client,
    ...render(
      <Providers user={opts.user ?? null} client={client}>
        {ui}
      </Providers>,
    ),
  };
}

/** Render routes with a memory router at `path`. */
export function renderRoutes(
  routes: RouteObject[],
  path: string,
  opts: { user?: User | null; client?: QueryClient } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = opts.client ?? testQueryClient();
  return {
    router,
    client,
    ...render(
      <Providers user={opts.user === undefined ? verifiedUser : opts.user} client={client}>
        <RouterProvider router={router} />
      </Providers>,
    ),
  };
}
