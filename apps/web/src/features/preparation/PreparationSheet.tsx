import {
  formatMinutesBefore,
  OVEN_FAN_LABELS_BG,
  type OvenFan,
  type OvenRack,
  ovenFanSchema,
  ovenRackSchema,
  PREPARATION_KINDS,
  PREPARATION_TEXT_MAX,
} from '@family/shared';
import { useId } from 'react';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import {
  MINUTES_BEFORE_CHOICES,
  type PreparationItemValues,
} from './preparation-values';

/** Грешките на един елемент по поле (`degrees`, `text`, `minutesBefore`, `kind`). */
export type PreparationItemErrors = Partial<Record<string, string>>;

interface PreparationSheetProps {
  item: PreparationItemValues;
  /** Номерът на елемента, от 1. */
  number: number;
  count: number;
  /** Друг елемент вече е фурна: „Фурна“ не може да се избере. */
  ovenTaken: boolean;
  errors: PreparationItemErrors;
  onChange: (patch: Partial<PreparationItemValues>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onClose: () => void;
}

const FAN_CHOICES: Record<OvenFan, string> = {
  fan: 'С вентилатор',
  conventional: 'Без вентилатор',
};

const RACK_CHOICES: Record<OvenRack, string> = {
  low: 'Долна',
  middle: 'Средна',
  high: 'Горна',
};

/**
 * Лист за един елемент от подготовката: първо вид, после полетата на вида — при фурната градуси, вентилатор и ниво,
 * при другите текст и колко преди. Отдолу „По-нагоре“, „По-надолу“ и „Премахни“.
 */
export function PreparationSheet({
  item,
  number,
  count,
  ovenTaken,
  errors,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onClose,
}: PreparationSheetProps) {
  const name = useId();
  // Стойност извън избора (напр. от внасяне) остава избрана с надписа си.
  const minutesChoices: readonly number[] =
    item.minutesBefore === null ||
    (MINUTES_BEFORE_CHOICES as readonly number[]).includes(item.minutesBefore)
      ? MINUTES_BEFORE_CHOICES
      : [...MINUTES_BEFORE_CHOICES, item.minutesBefore].sort((a, b) => a - b);

  return (
    <Sheet title="Подготовка" onClose={onClose}>
      <fieldset className="chips preparation-sheet__kinds" aria-label="Вид">
        {PREPARATION_KINDS.map((kind) => (
          <label key={kind.key} className="chip chip--radio">
            <input
              type="radio"
              name={`${name}-kind`}
              className="visually-hidden"
              checked={item.kind === kind.key}
              disabled={kind.key === 'oven' && ovenTaken}
              onChange={() => onChange({ kind: kind.key })}
            />
            <span aria-hidden="true">{kind.icon}</span>&nbsp;{kind.labelBg}
          </label>
        ))}
      </fieldset>
      {errors.kind !== undefined && (
        <p className="field__error">{errors.kind}</p>
      )}

      {item.kind === 'oven' && (
        <>
          <Field label="Градуси" error={errors.degrees}>
            {(props) => (
              <input
                {...props}
                className="field__input"
                inputMode="numeric"
                placeholder="180"
                value={item.degrees}
                onChange={(event) => onChange({ degrees: event.target.value })}
              />
            )}
          </Field>
          <fieldset className="chips" aria-label="Вентилатор">
            {ovenFanSchema.options.map((fan) => (
              <label
                key={fan}
                className="chip chip--radio"
                title={OVEN_FAN_LABELS_BG[fan]}
              >
                <input
                  type="radio"
                  name={`${name}-fan`}
                  className="visually-hidden"
                  checked={item.fan === fan}
                  onChange={() => onChange({ fan })}
                />
                {FAN_CHOICES[fan]}
              </label>
            ))}
          </fieldset>
          <p className="recipe-form__hint">
            Без вентилатор е горен и долен реотан.
          </p>
          <Field label="Скара">
            {(props) => (
              <select
                {...props}
                className="field__input"
                value={item.rack}
                onChange={(event) =>
                  onChange({ rack: event.target.value as OvenRack | '' })
                }
              >
                <option value="">Не е важно</option>
                {ovenRackSchema.options.map((rack) => (
                  <option key={rack} value={rack}>
                    {RACK_CHOICES[rack]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      )}

      {item.kind !== null && item.kind !== 'oven' && (
        <>
          <Field label="Какво" error={errors.text}>
            {(props) => (
              <input
                {...props}
                className="field__input"
                maxLength={PREPARATION_TEXT_MAX}
                value={item.text}
                onChange={(event) => onChange({ text: event.target.value })}
              />
            )}
          </Field>
          <Field label="Колко преди" error={errors.minutesBefore}>
            {(props) => (
              <select
                {...props}
                className="field__input"
                value={item.minutesBefore ?? ''}
                onChange={(event) =>
                  onChange({
                    minutesBefore:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              >
                <option value="">Не е важно</option>
                {minutesChoices.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatMinutesBefore(minutes)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      )}

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
          Премахни
        </button>
      </div>
    </Sheet>
  );
}
