import type { ReactNode } from 'react';
import { TEMPLATE_NOTICE } from './site';

/** Text in [brackets] is a placeholder and gets highlighted, also inside longer text. */
export function V({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  const parts = children.split(/(\[[^\]]+\])/);
  return (
    <>
      {parts.map((part, i) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <mark key={i} className="ph">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function TemplateNotice() {
  if (!TEMPLATE_NOTICE) return null;
  return (
    <div className="template-notice" role="note">
      <strong>Vorlage – vor Veröffentlichung ausfüllen und rechtlich prüfen lassen</strong>
      Gelb markierte Stellen sind Platzhalter. Die Angaben stehen in{' '}
      <code>frontend/src/legal/site.ts</code>. Dieser Hinweis verschwindet, wenn dort{' '}
      <code>TEMPLATE_NOTICE = false</code> gesetzt wird. Keine Rechtsberatung.
    </div>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="legal panel" aria-labelledby="h-legal">
      <title>{`${title} – Raumbelegung`}</title>
      <TemplateNotice />
      <h1 id="h-legal" className="h-page">
        {title}
      </h1>
      {children}
    </article>
  );
}
