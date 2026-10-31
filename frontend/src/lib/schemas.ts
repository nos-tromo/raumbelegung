import { z } from 'zod';

export const email = z
  .string()
  .trim()
  .min(1, 'E-Mail-Adresse eintragen')
  .pipe(z.email('Bitte eine gültige E-Mail-Adresse eintragen'));

export const PASSWORD_MIN = 10;

export const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Mindestens ${String(PASSWORD_MIN)} Zeichen`)
  .max(256, 'Höchstens 256 Zeichen');

/** Adds "confirm must match" and "must not contain the e-mail" checks. */
export function passwordRules<T extends { password: string; confirm: string; email?: string }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (v.password !== v.confirm) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirm'],
      message: 'Die Passwörter stimmen nicht überein',
    });
  }
  const mail = v.email?.trim().toLowerCase();
  if (mail && v.password.toLowerCase().includes(mail)) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: 'Das Passwort darf deine E-Mail-Adresse nicht enthalten',
    });
  }
}

export const displayName = z
  .string()
  .trim()
  .min(1, 'Namen eintragen')
  .max(80, 'Höchstens 80 Zeichen');
