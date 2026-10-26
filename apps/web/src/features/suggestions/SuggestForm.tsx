import {
  HINT_MAX,
  type PrepTimeRange,
  type RecipeSuggestParams,
  type Slot,
  slotSchema,
  type Tag,
  tagSchema,
} from '@family/shared';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { TagChips, TimeChips, toggled } from '../recipes/TagChips';
import { slotLabel } from './messages';

/** Таговете без слотовете: слотът се избира отделно. */
const EXTRA_TAGS = tagSchema.options.filter(
  (tag) => !(slotSchema.options as readonly string[]).includes(tag),
);

interface SuggestFormProps {
  onSubmit: (params: RecipeSuggestParams) => void;
  isSubmitting?: boolean;
  submitError?: unknown;
}

/** Слотове, интервали за време, тагове и подсказка за `recipe.suggest`; навсякъде може да са избрани няколко. */
export function SuggestForm({
  onSubmit,
  isSubmitting = false,
  submitError,
}: SuggestFormProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [times, setTimes] = useState<PrepTimeRange[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [hint, setHint] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (slots.length === 0) {
      return;
    }
    const trimmed = hint.trim();
    onSubmit({
      slots,
      ...(times.length > 0 ? { times } : {}),
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
            aria-pressed={slots.includes(option)}
            onClick={() => setSlots((current) => toggled(current, option))}
          >
            {slotLabel(option)}
          </button>
        ))}
      </fieldset>

      <span className="field__label">Време</span>
      <TimeChips
        label="Време"
        selected={times}
        onToggle={(time) => setTimes((current) => toggled(current, time))}
      />

      <span className="field__label">Тагове</span>
      <TagChips
        label="Тагове"
        options={EXTRA_TAGS}
        selected={tags}
        onToggle={(tag) => setTags((current) => toggled(current, tag))}
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
      <button
        type="submit"
        className="button"
        disabled={slots.length === 0 || isSubmitting}
      >
        Поискай предложения
      </button>
    </form>
  );
}
