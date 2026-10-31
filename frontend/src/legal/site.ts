/**
 * Betreiberangaben für Impressum und Datenschutzerklärung.
 *
 * Alles in [eckigen Klammern] ist ein Platzhalter und wird auf den Seiten
 * gelb markiert. Vor dem Go-live:
 *   1. alle Platzhalter ersetzen (nicht zutreffende Angaben auf null setzen),
 *   2. beide Texte rechtlich prüfen lassen (z. B. eRecht24-Generator oder Anwalt),
 *   3. TEMPLATE_NOTICE auf false setzen, damit der rote Hinweis verschwindet.
 */

/** Roter Hinweis oben auf Impressum und Datenschutz. Erst nach Prüfung auf false setzen. */
export const TEMPLATE_NOTICE = true;

export const SITE = {
  appName: 'Raumbelegung',
  domain: '[Domain, z. B. raum.example.de]',
  /** Stand der Datenschutzerklärung */
  lastUpdated: '[Datum, z. B. 1. Dezember 2026]',
} as const;

/** Anbieter nach § 5 DDG (Diensteanbieter) und Verantwortlicher nach Art. 4 Nr. 7 DSGVO */
export const OPERATOR = {
  name: '[Name / Verein]',
  /** Nur bei Vereinen, Firmen o. Ä.; sonst null */
  legalForm: '[Rechtsform, z. B. eingetragener Verein]' as string | null,
  street: '[Anschrift: Straße und Hausnummer]',
  city: '[PLZ und Ort]',
  country: 'Deutschland',
  email: '[E-Mail]',
  /** Telefon oder ein zweiter schneller Kontaktweg; empfohlen */
  phone: '[Telefon]' as string | null,
  /** Vertretungsberechtigte, z. B. Vorstand nach § 26 BGB; sonst null */
  representatives: '[Vertretungsberechtigt: Vorname Nachname (Vorsitz)]' as string | null,
  /** z. B. "Amtsgericht Musterstadt, VR 12345"; sonst null */
  register: '[Registergericht und Registernummer]' as string | null,
  /** USt-IdNr. nach § 27a UStG; sonst null */
  vatId: '[USt-IdNr.]' as string | null,
  /** Verantwortlich nach § 18 Abs. 2 MStV, nur bei journalistisch-redaktionellen Inhalten; sonst null */
  editorialResponsible: null as string | null,
  /** Datenschutzbeauftragte:r, falls benannt (Pflicht meist erst ab 20 Personen); sonst null */
  dataProtectionOfficer: null as string | null,
};

/** Auftragsverarbeiter (Art. 28 DSGVO) – AV-Verträge abschließen! */
export const PROCESSORS = {
  hosting: {
    name: 'Hetzner Online GmbH',
    address: 'Industriestr. 25, 91710 Gunzenhausen, Deutschland',
    location: 'Rechenzentrum [Standort, z. B. Nürnberg oder Falkenstein] in Deutschland',
  },
  email: {
    name: '[Name des E-Mail-Anbieters, z. B. Brevo, Mailjet oder Domain-Hoster]',
    address: '[Anschrift des E-Mail-Anbieters]',
    location: '[Serverstandort, z. B. EU]',
  },
};

/** Speicherfristen, so wie der Server konfiguriert ist */
export const RETENTION = {
  serverLogs: '[14 Tage]',
  session: '14 Tage',
  verifyLink: '24 Stunden',
  resetLink: '1 Stunde',
  invitation: '7 Tage',
  backups:
    'bis zu 6 Monate (tägliche Sicherungen: 7 Tage, wöchentliche: 4 Wochen, monatliche: 6 Monate)',
};

/** Zuständige Datenschutz-Aufsichtsbehörde (Bundesland des Betreibers) */
export const AUTHORITY = {
  name: '[Zuständige Aufsichtsbehörde, z. B. Bayerisches Landesamt für Datenschutzaufsicht]',
  address: '[Anschrift der Aufsichtsbehörde]',
  url: '[Website der Aufsichtsbehörde]',
};
