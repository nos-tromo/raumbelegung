import { errorMessage } from '../lib/api';

export function Loading({ label = 'Lädt …' }: { label?: string }) {
  return (
    <p className="loading" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function ServerError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="check bad" role="alert">
      <strong>Laden fehlgeschlagen</strong>
      {errorMessage(error)}
      {onRetry && (
        <div>
          <button type="button" className="link" onClick={onRetry}>
            Noch einmal versuchen
          </button>
        </div>
      )}
    </div>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {errorMessage(error)}
    </p>
  );
}
