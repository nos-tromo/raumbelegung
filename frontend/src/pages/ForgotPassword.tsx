import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { TextField } from '../components/Field';
import { FormError } from '../components/Status';
import { useForgotPassword } from '../lib/queries';
import { email } from '../lib/schemas';

const schema = z.object({ email });
type Values = z.infer<typeof schema>;

export function ForgotPassword() {
  const forgot = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  return (
    <section className="panel narrow" aria-labelledby="h-forgot">
      <title>Passwort vergessen – Raumbelegung</title>
      <h1 id="h-forgot" className="h-page">
        Passwort vergessen
      </h1>
      {forgot.isSuccess ? (
        <>
          <p className="check ok" role="status">
            <strong>Schau in dein Postfach</strong>
            Wenn es zu dieser Adresse ein Konto gibt, haben wir dir einen Link zum Zurücksetzen
            geschickt. Er ist eine Stunde gültig.
          </p>
          <p className="links">
            <Link to="/login">Zur Anmeldung</Link>
          </p>
        </>
      ) : (
        <>
          <p>Trag deine E-Mail-Adresse ein. Wir schicken dir einen Link für ein neues Passwort.</p>
          <form noValidate onSubmit={handleSubmit((v) => forgot.mutate(v.email))}>
            <TextField
              label="E-Mail-Adresse"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <FormError error={forgot.error} />
            <button className="btn" type="submit" disabled={forgot.isPending}>
              {forgot.isPending ? 'Wird gesendet …' : 'Link anfordern'}
            </button>
          </form>
          <p className="links">
            <Link to="/login">Zurück zur Anmeldung</Link>
          </p>
        </>
      )}
    </section>
  );
}
