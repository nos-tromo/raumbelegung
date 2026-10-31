import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RedirectIfAuthed, RequireAuth, RequireVerified } from './auth/guards';
import { ErrorPage } from './components/ErrorPage';
import { Layout } from './components/Layout';
import { Loading } from './components/Status';
import { CalendarList } from './pages/CalendarList';
import { CalendarView } from './pages/CalendarView';
import { ForgotPassword } from './pages/ForgotPassword';
import { Invite } from './pages/Invite';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';
import { Verify } from './pages/Verify';

/** Routes as in ARCHITEKTUR.md, section 6. */
export const routes: RouteObject[] = [
  {
    Component: Layout,
    ErrorBoundary: ErrorPage,
    HydrateFallback: () => <Loading />,
    children: [
      // No landing page: /app shows the calendars, or sends logged-out visitors to /login.
      { index: true, element: <Navigate to="/app" replace /> },
      {
        path: 'impressum',
        lazy: () => import('./pages/Impressum').then((m) => ({ Component: m.Impressum })),
      },
      {
        path: 'datenschutz',
        lazy: () => import('./pages/Datenschutz').then((m) => ({ Component: m.Datenschutz })),
      },
      { path: 'verify', Component: Verify },
      { path: 'forgot-password', Component: ForgotPassword },
      { path: 'reset-password', Component: ResetPassword },
      {
        Component: RedirectIfAuthed,
        children: [
          { path: 'login', Component: Login },
          { path: 'register', Component: Register },
        ],
      },
      {
        Component: RequireAuth,
        children: [
          { path: 'invite/:token', Component: Invite },
          {
            path: 'account',
            lazy: () => import('./pages/Account').then((m) => ({ Component: m.Account })),
          },
          {
            path: 'app',
            Component: RequireVerified,
            children: [
              { index: true, Component: CalendarList },
              { path: 'c/:id', Component: CalendarView },
              {
                path: 'c/:id/settings',
                lazy: () =>
                  import('./pages/CalendarSettings').then((m) => ({
                    Component: m.CalendarSettings,
                  })),
              },
            ],
          },
        ],
      },
      { path: '*', Component: NotFound },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
