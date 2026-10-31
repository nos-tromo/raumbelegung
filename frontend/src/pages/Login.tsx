import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { safeNext } from '../auth/context';
import { TextField } from '../components/Field';
import { FormError } from '../components/Status';
import { useLogin } from '../lib/queries';
import { email } from '../lib/schemas';

const schema = z.object({ email, password: z.string().min(1, 'Passwort eintragen') });
type Values = z.infer<typeof schema>;

export function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const location = useLocation();
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset;
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = (v: Values) =>
    login.mutate(v, { onSuccess: () => void navigate(next, { replace: true }) });

  const withNext = (path: string) =>
    next !== '/app' ? `${path}?next=${encodeURIComponent(next)}` : path;

  return (
    <section className="panel narrow" aria-labelledby="h-login">
      <title>Anmelden – Raumbelegung</title>
      <h1 id="h-login" className="h-page">
        Anmelden
      </h1>
      {passwordReset && (
        <p className="check ok" role="status">
          <strong>Passwort geändert</strong>
          Aus Sicherheitsgründen wurdest du überall abgemeldet. Melde dich mit dem neuen Passwort
          an.
        </p>
      )}
      {next.startsWith('/invite/') && (
        <p className="check">Melde dich an, um die Einladung anzunehmen.</p>
      )}
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <TextField
          label="E-Mail-Adresse"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Passwort"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <FormError error={login.error} />
        <button className="btn" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Wird angemeldet …' : 'Anmelden'}
        </button>
      </form>
      <p className="links">
        <Link to="/forgot-password">Passwort vergessen?</Link>
        <span>
          Noch kein Konto? <Link to={withNext('/register')}>Registrieren</Link>
        </span>
      </p>
    </section>
  );
}
