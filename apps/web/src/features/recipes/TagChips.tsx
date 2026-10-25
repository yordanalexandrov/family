import { TAG_LABELS_BG, type Tag, tagSchema } from '@family/shared';

interface TagChipsProps {
  selected: readonly Tag[];
  onToggle: (tag: Tag) => void;
  label: string;
}

/** Фиксираният списък тагове като toggle бутони (`aria-pressed`). */
export function TagChips({ selected, onToggle, label }: TagChipsProps) {
  return (
    <fieldset className="chips" aria-label={label}>
      {tagSchema.options.map((tag) => (
        <button
          key={tag}
          type="button"
          className="chip"
          aria-pressed={selected.includes(tag)}
          onClick={() => onToggle(tag)}
        >
          {TAG_LABELS_BG[tag]}
        </button>
      ))}
    </fieldset>
  );
}
