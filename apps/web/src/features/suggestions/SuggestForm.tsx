import {
  HINT_MAX,
  type RecipeSuggestParams,
  type Slot,
  slotSchema,
  type Tag,
  tagSchema,
} from '@family/shared';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { TagChips } from '../recipes/TagChips';
import { slotLabel } from './messages';

const MINUTES_OPTIONS = [15, 30, 45, 60] as const;
/** Таговете без слотовете: слотът се избира отделно. */
const EXTRA_TAGS = tagSchema.options.filter(
  (tag) => !(slotSchema.options as readonly string[]).includes(tag),
);

interface SuggestFormProps {
  onSubmit: (params: RecipeSuggestParams) => void;
  isSubmitting?: boolean;
  submitError?: unknown;
}

/** Слот, максимално време, тагове и подсказка за `recipe.suggest`. */
export function SuggestForm({
  onSubmit,
  isSubmitting = false,
  submitError,
}: SuggestFormProps) {
  const [slot, setSlot] = useState<Slot | undefined>();
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>();
  const [tags, setTags] = useState<Tag[]>([]);
  const [hint, setHint] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!slot) {
      return;
    }
    const trimmed = hint.trim();
    onSubmit({
      slot,
      ...(maxMinutes === undefined ? {} : { maxMinutes }),
      ...(tags.length > 0 ? { tags } : {}),
      ...(trimmed ? { hint: trimmed } : {}),
    });
  }

  return (
    <form className="suggest-form" noValidate onSubmit={submit}>
      <fieldset className="suggest-form__slots" aria-label="Слот">
        {slotSchema.options.map((option) => (
          <button
            key={option}
            type="button"
            className="suggest-form__slot"
            aria-pressed={slot === option}
            onClick={() => setSlot(option)}
          >
            {slotLabel(option)}
          </button>
        ))}
      </fieldset>

      <span className="field__label">Максимално време</span>
      <fieldset className="chips" aria-label="Максимално време">
        {MINUTES_OPTIONS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="chip"
            aria-pressed={maxMinutes === minutes}
            onClick={() => setMaxMinutes(minutes)}
          >
            {minutes} мин
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={maxMinutes === undefined}
          onClick={() => setMaxMinutes(undefined)}
        >
          без
        </button>
      </fieldset>

      <span className="field__label">Тагове</span>
      <TagChips
        label="Тагове"
        options={EXTRA_TAGS}
        selected={tags}
        onToggle={(tag) =>
          setTags((current) =>
            current.includes(tag)
              ? current.filter((t) => t !== tag)
              : [...current, tag],
          )
        }
      />

      <div className="field">
        <label className="field__label" htmlFor="suggest-hint">
          Подсказка
        </label>
        <input
          id="suggest-hint"
          className="field__input"
          maxLength={HINT_MAX}
          placeholder="напр. нещо с пиле"
          value={hint}
          onChange={(event) => setHint(event.target.value)}
        />
        <span className="suggest-form__counter">
          {hint.length}/{HINT_MAX}
        </span>
      </div>

      {submitError !== undefined && submitError !== null && (
        <ErrorBox error={submitError} />
      )}
      <button type="submit" className="button" disabled={!slot || isSubmitting}>
        Поискай предложения
      </button>
    </form>
  );
}
