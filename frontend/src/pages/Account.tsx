import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../auth/context';
import { TextField } from '../components/Field';
import { FormError } from '../components/Status';
import { api, errorMessage, lastOwnerCalendars } from '../lib/api';
import { useChangePassword, useDeleteMe, useUpdateMe } from '../lib/queries';
import { PASSWORD_MIN, displayName, newPassword, passwordRules } from '../lib/schemas';
import type { User } from '../lib/types';

/* ---------- Name ---------- */

const nameSchema = z.object({ display_name: displayName });
type NameValues = z.infer<typeof nameSchema>;

function NameForm({ user }: { user: User }) {
  const update = useUpdateMe();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: { display_name: user.display_name },
  });
  return (
    <section className="panel" aria-labelledby="h-name">
      <h2 id="h-name">Profil</h2>
      <form
        noValidate
        onSubmit={handleSubmit((v) => {
          setSaved(false);
          update.mutate(v, {
            onSuccess: (u) => {
              reset({ display_name: u.display_name });
              setSaved(true);
            },
          });
        })}
      >
        <TextField label="E-Mail-Adresse" value={user.email} readOnly disabled />
        <TextField
          label="Name"
          maxLength={80}
          autoComplete="name"
          hint="Andere Mitglieder sehen diesen Namen."
          error={errors.display_name?.message}
          {...register('display_name')}
        />
        <FormError error={update.error} />
        <button className="btn" type="submit" disabled={update.isPending || !isDirty}>
          {update.isPending ? 'Wird gespeichert …' : 'Name speichern'}
        </button>
        <p className="msg" role="status">
          {saved && !isDirty ? 'Gespeichert.' : ''}
        </p>
      </form>
    </section>
  );
}

/* ---------- Password ---------- */

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Aktuelles Passwort eintragen'),
    password: newPassword,
    confirm: z.string(),
    // Not a visible field: only used to check that the password does not contain it.
    email: z.string(),
  })
  .superRefine(passwordRules);
type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordForm({ user }: { user: User }) {
  const change = useChangePassword();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', password: '', confirm: '', email: user.email },
  });

  return (
    <section className="panel" aria-labelledby="h-pw">
      <h2 id="h-pw">Passwort ändern</h2>
      <form
        noValidate
        onSubmit={handleSubmit((v) => {
          setSaved(false);
          change.mutate(
            { current: v.current, next: v.password },
            {
              onSuccess: () => {
                reset({ current: '', password: '', confirm: '', email: user.email });
                setSaved(true);
              },
            },
          );
        })}
      >
        {/* Lets password managers attach the new password to the right account. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user.email}
          readOnly
          hidden
        />
        <TextField
          label="Aktuelles Passwort"
          type="password"
          autoComplete="current-password"
          error={errors.current?.message}
          {...register('current')}
        />
        <TextField
          label="Neues Passwort"
          type="password"
          autoComplete="new-password"
          hint={`Mindestens ${String(PASSWORD_MIN)} Zeichen, ohne deine E-Mail-Adresse.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Neues Passwort wiederholen"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <FormError error={change.error} />
        <button className="btn" type="submit" disabled={change.isPending}>
          {change.isPending ? 'Wird gespeichert …' : 'Passwort ändern'}
        </button>
        <p className="msg" role="status">
          {saved ? 'Passwort geändert. Auf anderen Geräten bist du jetzt abgemeldet.' : ''}
        </p>
      </form>
    </section>
  );
}

/* ---------- Export ---------- */

function filenameFrom(res: Response): string {
  const cd = res.headers.get('Content-Disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star?.[1]) return decodeURIComponent(star[1]);
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain?.[1] ?? 'raumbelegung-export.json';
}

function Export() {
  const [state, setState] = useState<{ busy: boolean; error: unknown }>({
    busy: false,
    error: null,
  });
  const download = async () => {
    setState({ busy: true, error: null });
    try {
      const res = await api.exportMe();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFrom(res);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };
  return (
    <section className="panel" aria-labelledby="h-export">
      <h2 id="h-export">Deine Daten</h2>
      <p>
        Lade alles herunter, was wir zu deinem Konto speichern: Profil, Mitgliedschaften und deine
        Buchungen, als JSON-Datei (Art. 20 DSGVO).
      </p>
      <FormError error={state.error} />
      <button type="button" className="btn ghost" disabled={state.busy} onClick={download}>
        {state.busy ? 'Wird vorbereitet …' : 'Daten herunterladen'}
      </button>
    </section>
  );
}

/* ---------- Delete account ---------- */

const deleteSchema = z.object({ password: z.string().min(1, 'Passwort eintragen') });
type DeleteValues = z.infer<typeof deleteSchema>;

function DeleteAccount() {
  const del = useDeleteMe();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeleteValues>({ resolver: zodResolver(deleteSchema) });
  const blocking = lastOwnerCalendars(del.error);

  return (
    <section className="panel danger" aria-labelledby="h-del">
      <h2 id="h-del">Konto löschen</h2>
      <p>
        Dein Konto und deine Mitgliedschaften werden sofort gelöscht. Deine Buchungen bleiben in den
        Kalendern, aber ohne deinen Namen.
      </p>
      <form noValidate onSubmit={handleSubmit((v) => del.mutate(v.password))}>
        <TextField
          label="Zum Bestätigen dein Passwort"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {del.isError && (
          <div className="check bad" role="alert">
            <strong>Konto nicht gelöscht</strong>
            {blocking.length ? (
              <>
                Du bist in diesen Kalendern die einzige Person mit der Rolle „Verwalten“. Gib die
                Rolle zuerst jemand anderem oder lösche den Kalender:
                <ul>
                  {blocking.map((c) => (
                    <li key={c.id || c.name}>
                      {c.id ? <Link to={`/app/c/${c.id}/settings`}>{c.name}</Link> : c.name}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              errorMessage(del.error)
            )}
          </div>
        )}
        <button className="btn warn" type="submit" disabled={del.isPending}>
          {del.isPending ? 'Wird gelöscht …' : 'Konto endgültig löschen'}
        </button>
      </form>
    </section>
  );
}

export function Account() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <title>Konto – Raumbelegung</title>
      <header className="pagehead">
        <div>
          <h1>Dein Konto</h1>
          <p className="sub">{user.email}</p>
        </div>
      </header>
      <div className="grid">
        <div className="col">
          <NameForm user={user} />
          <PasswordForm user={user} />
        </div>
        <div className="col">
          <Export />
          <DeleteAccount />
        </div>
      </div>
    </>
  );
}
