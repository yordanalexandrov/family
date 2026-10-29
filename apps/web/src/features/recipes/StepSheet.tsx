import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';

interface StepSheetProps {
  /** Номерът на стъпката, от 1. */
  number: number;
  count: number;
  text: string;
  /** Грешката на стъпката от последния опит за запис. */
  error?: string | undefined;
  onChange: (text: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Лист за една стъпка в `RecipeForm`: текстът, „По-нагоре“, „По-надолу“ и „Премахни стъпка“. */
export function StepSheet({
  number,
  count,
  text,
  error,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onClose,
}: StepSheetProps) {
  return (
    <Sheet title="Стъпка" onClose={onClose}>
      <Field label={`Стъпка ${number}`} error={error}>
        {(props) => (
          <textarea
            {...props}
            className="field__input step-sheet__text"
            value={text}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
      <div className="recipes__actions">
        <button
          type="button"
          className="button button--quiet"
          disabled={number === 1}
          onClick={onMoveUp}
        >
          По-нагоре
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={number === count}
          onClick={onMoveDown}
        >
          По-надолу
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={onRemove}
        >
          Премахни стъпка
        </button>
      </div>
    </Sheet>
  );
}
