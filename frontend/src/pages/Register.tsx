import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { safeNext } from '../auth/context';
import { TextField } from '../components/Field';
import { FormError } from '../components/Status';
import { useRegister } from '../lib/queries';
import { PASSWORD_MIN, displayName, email, newPassword, passwordRules } from '../lib/schemas';

const schema = z
  .object({ email, display_name: displayName, password: newPassword, confirm: z.string() })
  .superRefine(passwordRules);
type Values = z.infer<typeof schema>;

export function Register() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const reg = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (reg.isSuccess) {
    return (
      <section className="panel narrow" aria-labelledby="h-reg">
        <title>Fast geschafft – Raumbelegung</title>
        <h1 id="h-reg" className="h-page">
          Fast geschafft
        </h1>
        <p role="status">
          Wir haben dir eine E-Mail an <strong>{reg.data.email}</strong> geschickt. Klicke auf den
          Link darin, um dein Konto zu aktivieren. Der Link ist 24 Stunden gültig.
        </p>
        {next.startsWith('/invite/') && (
          <p>
            Nach der Bestätigung meldest du dich über den Button unten an und nimmst die Einladung
            an. Alternativ öffnest du noch einmal den Link aus der Einladungs-Mail.
          </p>
        )}
        <p>
          <Link
            className="btn"
            to={next !== '/app' ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          >
            Zur Anmeldung
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="panel narrow" aria-labelledby="h-reg">
      <title>Registrieren – Raumbelegung</title>
      <h1 id="h-reg" className="h-page">
        Konto anlegen
      </h1>
      <form
        noValidate
        onSubmit={handleSubmit(({ email, display_name, password }) =>
          reg.mutate({ email, display_name, password }),
        )}
      >
        <TextField
          label="E-Mail-Adresse"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Name"
          type="text"
          autoComplete="name"
          maxLength={80}
          hint="So sehen dich andere Mitglieder, z. B. bei deinen Buchungen."
          error={errors.display_name?.message}
          {...register('display_name')}
        />
        <TextField
          label="Passwort"
          type="password"
          autoComplete="new-password"
          hint={`Mindestens ${String(PASSWORD_MIN)} Zeichen, ohne deine E-Mail-Adresse.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Passwort wiederholen"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <FormError error={reg.error} />
        <button className="btn" type="submit" disabled={reg.isPending}>
          {reg.isPending ? 'Wird angelegt …' : 'Konto anlegen'}
        </button>
        <p className="hint">
          Mit der Registrierung verarbeiten wir deine Daten wie in der{' '}
          <Link to="/datenschutz">Datenschutzerklärung</Link> beschrieben.
        </p>
      </form>
      <p className="links">
        <span>
          Schon registriert?{' '}
          <Link to={next !== '/app' ? `/login?next=${encodeURIComponent(next)}` : '/login'}>
            Anmelden
          </Link>
        </span>
      </p>
    </section>
  );
}
