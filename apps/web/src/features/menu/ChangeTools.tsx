import {
  type DateKey,
  MEAL_NOTE_MAX,
  type Meal,
  type MealPlan,
  type UpdateMeal,
} from '@family/shared';
import { type FormEvent, useState } from 'react';
import { MealReplace } from './MealReplace';
import { MoveMeal, swapTargetsOf } from './MoveMeal';
import { RecipePicker } from './RecipePicker';

type ChangeTool = 'pick' | 'swap' | 'note';

interface ChangeToolsProps {
  meal: Meal;
  plan: MealPlan;
  today: DateKey;
  /** С „✨ Предложи друго“ отгоре; празният ден има свой главен бутон над инструментите. */
  replace: boolean;
  /** С „Размени с друг ден“, ако има с кой. */
  swap: boolean;
  onChange: (change: UpdateMeal) => void;
  onSwapped: () => void;
  /** „Махни ястието от деня“; без него бутонът го няма. Кога се предлага решава листът. */
  onRemove?: (() => void) | undefined;
}

/**
 * Начините да се смени ястието в листа на деня, всеки се разгъва на място: „✨ Предложи друго“ (`replace`), „Избери от
 * рецептите“, „Размени с друг ден“ (`swap`, ако има с кой) и „Бележка вместо ястие“; отделно и в червено „Махни
 * ястието от деня“ (`onRemove`). На празен ден същите без „Предложи друго“ и „Махни“: главният бутон е над тях.
 */
export function ChangeTools({
  meal,
  plan,
  today,
  replace,
  swap,
  onChange,
  onSwapped,
  onRemove,
}: ChangeToolsProps) {
  const [open, setOpen] = useState<ChangeTool | null>(null);
  const swapTargets = swapTargetsOf(meal, plan, today);
  const tools: { key: ChangeTool; label: string }[] = [
    { key: 'pick', label: 'Избери от рецептите' },
    ...(swap && swapTargets.length > 0
      ? [{ key: 'swap' as const, label: 'Размени с друг ден' }]
      : []),
    { key: 'note', label: 'Бележка вместо ястие' },
  ];
  return (
    <div className="meal-tools">
      {replace && (
        <div className="meal-tools__replace">
          <ReplaceMeal meal={meal} plan={plan} onChange={onChange} />
        </div>
      )}
      {tools.map((tool) => (
        <div key={tool.key} className="meal-tools__tool">
          <button
            type="button"
            className="meal-tools__item"
            aria-expanded={open === tool.key}
            onClick={() => setOpen(open === tool.key ? null : tool.key)}
          >
            {tool.label}
            <span aria-hidden="true" className="meal-tools__chevron">
              ›
            </span>
          </button>
          {open === tool.key && (
            <div className="meal-tools__open">
              {tool.key === 'pick' && (
                <RecipePicker meal={meal} plan={plan} onPick={onChange} />
              )}
              {tool.key === 'swap' && (
                <MoveMeal
                  meal={meal}
                  plan={plan}
                  targets={swapTargets}
                  onSwapped={onSwapped}
                />
              )}
              {tool.key === 'note' && (
                <NoteField key={meal.note} meal={meal} onSave={onChange} />
              )}
            </div>
          )}
        </div>
      ))}
      {onRemove && (
        <button
          type="button"
          className="meal-tools__item meal-tools__item--danger"
          onClick={onRemove}
        >
          Махни ястието от деня
        </button>
      )}
    </div>
  );
}

/** „✨ Предложи друго“ (или `askLabel`): избраната от AI рецепта и „защо“-то ѝ отиват в `onChange`. */
export function ReplaceMeal({
  meal,
  plan,
  askLabel,
  onChange,
}: {
  meal: Meal;
  plan: MealPlan;
  askLabel?: string;
  onChange: (change: UpdateMeal) => void;
}) {
  return (
    <MealReplace
      key={meal.id}
      meal={meal}
      weekStart={plan.weekStart}
      {...(askLabel ? { askLabel } : {})}
      onPick={({ recipeId, why }) => onChange({ recipeId, why })}
    />
  );
}

function NoteField({
  meal,
  onSave,
}: {
  meal: Meal;
  onSave: (change: UpdateMeal) => void;
}) {
  const [note, setNote] = useState(meal.note ?? '');
  const changed = note.trim() !== (meal.note ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ note });
  }

  return (
    <form className="field" noValidate onSubmit={submit}>
      <label className="field__label" htmlFor="meal-note">
        Бележка
      </label>
      <div className="sheet__row">
        <input
          id="meal-note"
          className="field__input"
          maxLength={MEAL_NOTE_MAX}
          placeholder="напр. ядем навън"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="submit" className="button" disabled={!changed}>
          Запази
        </button>
      </div>
    </form>
  );
}
