import { type ReactElement, useId } from 'react';

interface FieldProps {
  label: string;
  error?: string | undefined;
  /** Получава `id`, `aria-invalid` и `aria-describedby` за самото поле. */
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactElement;
  className?: string;
}

/** Етикет, поле и грешката под него. */
export function Field({ label, error, children, className }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error !== undefined,
        'aria-describedby': error === undefined ? undefined : errorId,
      })}
      {error !== undefined && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
