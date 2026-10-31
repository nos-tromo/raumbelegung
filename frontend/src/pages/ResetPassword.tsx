import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { TextField } from '../components/Field';
import { FormError } from '../components/Status';
import { qk, useResetPassword } from '../lib/queries';
import { PASSWORD_MIN, newPassword, passwordRules } from '../lib/schemas';

const schema = z.object({ password: newPassword, confirm: z.string() }).superRefine(passwordRules);
type Values = z.infer<typeof schema>;

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  return (
    <section className="panel narrow" aria-labelledby="h-reset">
      <title>Neues Passwort – Raumbelegung</title>
      <h1 id="h-reset" className="h-page">
        Neues Passwort
      </h1>
      {!token ? (
        <p className="check bad">
          <strong>Kein gültiger Link</strong>
          Öffne den Link aus der E-Mail vollständig, oder{' '}
          <Link to="/forgot-password">fordere einen neuen an</Link>.
        </p>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit((v) =>
            reset.mutate(
              { token, password: v.password },
              {
                // The server ended every session: continue on the login page.
                onSuccess: () => {
                  qc.setQueryData(qk.me, null);
                  void navigate('/login', { replace: true, state: { passwordReset: true } });
                },
              },
            ),
          )}
        >
          <TextField
            label="Neues Passwort"
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
          <FormError error={reset.error} />
          {reset.isError && (
            <p className="links">
              <Link to="/forgot-password">Neuen Link anfordern</Link>
            </p>
          )}
          <button className="btn" type="submit" disabled={reset.isPending}>
            {reset.isPending ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
        </form>
      )}
    </section>
  );
}
