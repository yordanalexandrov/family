import { useLayoutEffect, useRef } from 'react';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { StepPhotoField } from '../step-photos/StepPhotoField';

interface StepSheetProps {
  /** Номерът на стъпката, от 1. */
  number: number;
  count: number;
  text: string;
  photoId: string | undefined;
  /** Грешката на стъпката от последния опит за запис. */
  error?: string | undefined;
  onChange: (text: string) => void;
  /** Нова (вече качена) снимка или `undefined` при „Махни“. */
  onPhotoChange: (photoId: string | undefined) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Лист за една стъпка в `RecipeForm`: текстът, снимката, „По-нагоре“, „По-надолу“ и „Премахни стъпка“. */
export function StepSheet({
  number,
  count,
  text,
  photoId,
  error,
  onChange,
  onPhotoChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onClose,
}: StepSheetProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Полето расте с текста (и с шрифта на телефона), за да се вижда цялата стъпка; листът се превърта, ако не стига.
  // biome-ignore lint/correctness/useExhaustiveDependencies: височината следва текста.
  useLayoutEffect(() => {
    const field = textRef.current;
    if (!field) {
      return;
    }
    field.style.height = 'auto';
    const border = field.offsetHeight - field.clientHeight;
    field.style.height = `${field.scrollHeight + border}px`;
  }, [text]);

  return (
    <Sheet title="Стъпка" onClose={onClose}>
      <Field label={`Стъпка ${number}`} error={error}>
        {(props) => (
          <textarea
            {...props}
            ref={textRef}
            className="field__input step-sheet__text"
            value={text}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
      <StepPhotoField
        number={number}
        photoId={photoId}
        onChange={onPhotoChange}
      />
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
