import {
  useId,
  type InputHTMLAttributes,
  type Ref,
  type SelectHTMLAttributes,
  type ReactNode,
} from 'react';

interface Common {
  label: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
}

function describedBy(id: string, hint: unknown, error: unknown) {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ');
  return ids || undefined;
}

export function TextField({
  label,
  error,
  hint,
  id,
  ref,
  ...rest
}: Common & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label htmlFor={fid}>
      {label}
      <input
        id={fid}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        {...rest}
      />
      {hint && (
        <span className="field-hint" id={`${fid}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${fid}-err`}>
          {error}
        </span>
      )}
    </label>
  );
}

export function SelectField({
  label,
  error,
  hint,
  id,
  ref,
  children,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label htmlFor={fid}>
      {label}
      <select
        id={fid}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, hint, error)}
        {...rest}
      >
        {children}
      </select>
      {hint && (
        <span className="field-hint" id={`${fid}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${fid}-err`}>
          {error}
        </span>
      )}
    </label>
  );
}
