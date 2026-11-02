import { formatServings } from '../../lib/format';

interface ServingsStepperProps {
  servings: number;
  onChange: (servings: number) => void;
  /** Чии са порциите: „Песто“ дава „Песто: една порция повече“; без него — порциите на рецептата. */
  of?: string;
}

/** Порциите с −/+ на стъпки от 1 порция, не под 1: на рецептата и на всеки компонент в Готвене. */
export function ServingsStepper({
  servings,
  onChange,
  of,
}: ServingsStepperProps) {
  const label = (text: string) =>
    of === undefined ? `Една порция ${text}` : `${of}: една порция ${text}`;
  return (
    <div className="cooking-ingredients__servings">
      <button
        type="button"
        className="button button--quiet cooking-ingredients__step"
        aria-label={label('по-малко')}
        disabled={servings <= 1}
        onClick={() => onChange(servings - 1)}
      >
        −
      </button>
      <span>за {formatServings(servings)}</span>
      <button
        type="button"
        className="button button--quiet cooking-ingredients__step"
        aria-label={label('повече')}
        onClick={() => onChange(servings + 1)}
      >
        +
      </button>
    </div>
  );
}
