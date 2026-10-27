import {
  addDays,
  type DateKey,
  isPastMeal,
  MEAL_NOTE_MAX,
  type Meal,
  type MealPlan,
  mealOutcome,
  type UpdateMeal,
  type User,
  type VoteValue,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { formatDayLong } from '../../lib/format';
import { useRecipes } from '../recipes/queries';
import { useDebouncedValue } from '../recipes/useDebouncedValue';
import { usePlan, useUpdateMeal } from './queries';
import { MyVote, OutcomeLabel, PersonVote } from './Votes';

const SEARCH_DEBOUNCE_MS = 300;

interface MealSheetProps {
  meal: Meal;
  plan: MealPlan;
  users: User[];
  today: DateKey;
  /** Действащият потребител, който гласува; без него листът е без гласове. */
  voterId?: string;
  onVote?: (meal: Meal, value: VoteValue | null) => void;
  onClose: () => void;
}

/**
 * Листът на едно ястие: отгоре гласовете на двамата, после връзка към рецептата, рецепта, бележка, готвач и порции;
 * всяко действие е отделен `PATCH`. Минал ден пази рецептата и бележката, а готвачът и порциите се сменят.
 */
export function MealSheet({
  meal,
  plan,
  users,
  today,
  voterId,
  onVote,
  onClose,
}: MealSheetProps) {
  const update = useUpdateMeal(plan.weekStart);
  const day = formatDayLong(meal.date);
  const past = isPastMeal(meal, today);

  function patch(change: UpdateMeal) {
    update.mutate({ id: meal.id, patch: change });
  }

  return (
    <Sheet title={day} onClose={onClose}>
      {update.isError && <ErrorBox error={update.error} />}
      {voterId && (
        <fieldset className="sheet__section meal-votes" aria-label="Гласове">
          <legend className="field__label">Гласове</legend>
          <div className="meal-votes__people">
            {users.map((user) => (
              <PersonVote key={user.id} meal={meal} user={user} showName />
            ))}
            {!past && (
              <OutcomeLabel
                outcome={mealOutcome(
                  meal.votes,
                  users.map((user) => user.id),
                )}
              />
            )}
          </div>
          {!past && onVote && (
            <MyVote
              meal={meal}
              userId={voterId}
              onVote={(value) => onVote(meal, value)}
              big
            />
          )}
        </fieldset>
      )}
      {meal.recipeId !== null && (
        <div className="sheet__section">
          <Link
            to="/recipes/$id"
            params={{ id: meal.recipeId }}
            className="button button--quiet"
          >
            Към рецептата
          </Link>
        </div>
      )}
      {past ? (
        <p className="sheet__section meal-votes__past">
          Денят е минал: ястието и бележката не се сменят.
        </p>
      ) : (
        <>
          <RecipePicker meal={meal} plan={plan} onPick={patch} />
          <NoteField key={meal.note} meal={meal} onSave={patch} />
        </>
      )}
      <CookPicker meal={meal} users={users} onPick={patch} />
      <ServingsEditor meal={meal} users={users} onChange={patch} />
    </Sheet>
  );
}

interface PickerProps {
  meal: Meal;
  plan: MealPlan;
  onPick: (change: UpdateMeal) => void;
}

/** Търсене сред вечерните рецепти с маркери „в тази седмица“ и „последните 2 седмици“. */
function RecipePicker({ meal, plan, onPick }: PickerProps) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const recipes = useRecipes({ tags: ['dinner'], ...(q ? { q } : {}) });
  const recent = useRecentRecipeIds(plan.weekStart);
  const inWeek = new Set(
    plan.meals
      .filter((m) => m.id !== meal.id && m.recipeId !== null)
      .map((m) => m.recipeId),
  );

  return (
    <fieldset className="sheet__section">
      <legend className="field__label">Рецепта</legend>
      <input
        type="search"
        className="field__input"
        aria-label="Търси рецепта"
        placeholder="Търси по заглавие"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {recipes.isPending ? (
        <Spinner />
      ) : recipes.isError ? (
        <ErrorBox
          error={recipes.error}
          onRetry={() => void recipes.refetch()}
        />
      ) : (
        <ul className="recipe-picker" aria-label="Вечерни рецепти">
          {meal.recipeId !== null && (
            <li>
              <button
                type="button"
                className="recipe-picker__option"
                onClick={() => onPick({ recipeId: null })}
              >
                Без рецепта
              </button>
            </li>
          )}
          {recipes.data.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                className="recipe-picker__option"
                aria-pressed={recipe.id === meal.recipeId}
                onClick={() =>
                  recipe.id !== meal.recipeId && onPick({ recipeId: recipe.id })
                }
              >
                <span>{recipe.title}</span>
                {inWeek.has(recipe.id) && (
                  <span className="badge">в тази седмица</span>
                )}
                {recent.has(recipe.id) && (
                  <span className="badge">последните 2 седмици</span>
                )}
              </button>
            </li>
          ))}
          {recipes.data.length === 0 && (
            <li className="recipe-picker__empty">Няма такава рецепта.</li>
          )}
        </ul>
      )}
    </fieldset>
  );
}

/** Рецептите от менютата на двете предходни седмици. */
function useRecentRecipeIds(weekStart: string): Set<string> {
  const week1 = usePlan(addDays(weekStart, -7));
  const week2 = usePlan(addDays(weekStart, -14));
  const ids = new Set<string>();
  for (const plan of [week1.data, week2.data]) {
    for (const meal of plan?.meals ?? []) {
      if (meal.recipeId !== null) {
        ids.add(meal.recipeId);
      }
    }
  }
  return ids;
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
    <form className="sheet__section field" noValidate onSubmit={submit}>
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

function CookPicker({
  meal,
  users,
  onPick,
}: {
  meal: Meal;
  users: User[];
  onPick: (change: UpdateMeal) => void;
}) {
  return (
    <fieldset className="sheet__section">
      <legend className="field__label">Готвач</legend>
      <div className="chips">
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            className="chip cook-chip"
            aria-pressed={meal.cookUserId === user.id}
            onClick={() => onPick({ cookUserId: user.id })}
          >
            <Avatar initial={user.initial} color={user.color} size="sm" />
            {user.name}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={meal.cookUserId === null}
          onClick={() => onPick({ cookUserId: null })}
        >
          никой
        </button>
      </div>
    </fieldset>
  );
}

function ServingsEditor({
  meal,
  users,
  onChange,
}: {
  meal: Meal;
  users: User[];
  onChange: (change: UpdateMeal) => void;
}) {
  function set(userId: string, count: number) {
    onChange({ servings: { ...meal.servings, [userId]: count } });
  }

  return (
    <fieldset className="sheet__section">
      <legend className="field__label">Порции</legend>
      <ul className="servings">
        {users.map((user) => {
          const count = meal.servings[user.id] ?? 0;
          return (
            <li key={user.id} className="servings__row">
              <span className="servings__name">{user.name}</span>
              <button
                type="button"
                className="servings__step"
                aria-label={`По-малко порции за ${user.name}`}
                disabled={count === 0}
                onClick={() => set(user.id, count - 1)}
              >
                −
              </button>
              <output
                className="servings__count"
                aria-label={`Порции за ${user.name}`}
              >
                {count}
              </output>
              <button
                type="button"
                className="servings__step"
                aria-label={`Повече порции за ${user.name}`}
                onClick={() => set(user.id, count + 1)}
              >
                +
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
