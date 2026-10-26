import {
  PREP_TIME_LABELS_BG,
  type PrepTimeRange,
  prepTimeRangeSchema,
  TAG_LABELS_BG,
  type Tag,
  tagSchema,
} from '@family/shared';

interface ChoiceChipsProps<T extends string> {
  options: readonly T[];
  labels: Record<T, string>;
  selected: readonly T[];
  onToggle: (value: T) => void;
  label: string;
}

/** Фиксиран списък стойности като toggle бутони (`aria-pressed`); може да са избрани няколко. */
function ChoiceChips<T extends string>({
  options,
  labels,
  selected,
  onToggle,
  label,
}: ChoiceChipsProps<T>) {
  return (
    <fieldset className="chips" aria-label={label}>
      {options.map((value) => (
        <button
          key={value}
          type="button"
          className="chip"
          aria-pressed={selected.includes(value)}
          onClick={() => onToggle(value)}
        >
          {labels[value]}
        </button>
      ))}
    </fieldset>
  );
}

/** `list` с `value`, ако го няма, иначе без него: състоянието на мулти избор след натискане на чип. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

interface TagChipsProps {
  selected: readonly Tag[];
  onToggle: (tag: Tag) => void;
  label: string;
  /** Кои тагове да се покажат; по подразбиране всички. */
  options?: readonly Tag[];
}

/** Фиксираният списък тагове като toggle бутони. */
export function TagChips({
  options = tagSchema.options,
  ...props
}: TagChipsProps) {
  return <ChoiceChips options={options} labels={TAG_LABELS_BG} {...props} />;
}

interface TimeChipsProps {
  selected: readonly PrepTimeRange[];
  onToggle: (range: PrepTimeRange) => void;
  label: string;
}

/** Интервалите за време („до 15 мин“ … „над 60 мин“) като toggle бутони. */
export function TimeChips(props: TimeChipsProps) {
  return (
    <ChoiceChips
      options={prepTimeRangeSchema.options}
      labels={PREP_TIME_LABELS_BG}
      {...props}
    />
  );
}
