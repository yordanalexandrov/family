import {
  addDays,
  type DateKey,
  isEmptyMeal,
  isPastMeal,
  MEAL_NOTE_MAX,
  type Meal,
  type MealPlan,
  mealOutcome,
  mealTitle,
  type UpdateMeal,
  type User,
  type VoteValue,
  weekdayName,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { Toast } from '../../components/Toast';
import { formatDayLong } from '../../lib/format';
import { useRecipes } from '../recipes/queries';
import { useDebouncedValue } from '../recipes/useDebouncedValue';
import { MealReplace } from './MealReplace';
import { MoveMeal } from './MoveMeal';
import { usePlan, useUpdateMeal } from './queries';
import { Thread } from './Thread';
import { MyVote, OutcomeLabel, PersonVote } from './Votes';

const SEARCH_DEBOUNCE_MS = 300;

interface MealSheetProps {
  meal: Meal;
  plan: MealPlan;
  users: User[];
  today: DateKey;
  /** Минала седмица: всичко се чете (и разговорът), нищо не се сменя. */
  readOnly?: boolean;
  /** Действащият потребител, който гласува; без него листът е без гласове. */
  voterId?: string;
  onVote?: (meal: Meal, value: VoteValue | null) => void;
  /** „Махни ястието от деня“ е минало: екранът показва toast-а с „Върни“, който остава и след затварянето на листа. */
  onRecipeRemoved: (removed: RemovedRecipe) => void;
  onClose: () => void;
}

/**
 * Листът на едно ястие: отгоре цялото заглавие и „защо“ (редът ги съкращава), гласовете на двамата и разговорът, после
 * връзка към рецептата, „Избери сам“ (изборът от регистъра), „✨ Предложи друго“ (`meal.replace`), бележка, готвач и порции; всяко действие е отделен `PATCH`. Минал ден пази рецептата и бележката, а
 * готвачът и порциите се сменят; разговорът му се чете, но не се пише. В минала седмица (`readOnly`) не се сменят и те.
 * Празен ден (без рецепта и бележка) е без гласове: чака ястие. Махнатата рецепта отива в `onRecipeRemoved`, за „Върни“.
 */
export function MealSheet({
  meal,
  plan,
  users,
  today,
  readOnly = false,
  voterId,
  onVote,
  onRecipeRemoved,
  onClose,
}: MealSheetProps) {
  const update = useUpdateMeal(plan.weekStart);
  const day = formatDayLong(meal.date);
  const title = mealTitle(meal);
  const past = readOnly || isPastMeal(meal, today);
  // Празен ден чака ястие, не глас: без чиповете на гласовете и без моите 👎/👍.
  const empty = isEmptyMeal(meal);
  const [picking, setPicking] = useState(false);

  function patch(change: UpdateMeal) {
    update.mutate({ id: meal.id, patch: change });
  }

  function removeRecipe() {
    if (meal.recipeId === null) {
      return;
    }
    const before: RemovedRecipe = {
      mealId: meal.id,
      date: meal.date,
      recipeId: meal.recipeId,
      why: meal.why,
      title: title ?? '',
    };
    update.mutate(
      { id: meal.id, patch: { recipeId: null } },
      { onSuccess: () => onRecipeRemoved(before) },
    );
  }

  return (
    <Sheet title={day} onClose={onClose}>
      {update.isError && <ErrorBox error={update.error} />}
      {(title || meal.why) && (
        <div className="sheet__section meal-sheet__head">
          {title && <h3 className="meal-sheet__title">{title}</h3>}
          {meal.why && <p className="meal-sheet__why">{meal.why}</p>}
        </div>
      )}
      {voterId && !(past && empty) && (
        <fieldset className="sheet__section meal-votes" aria-label="Гласове">
          <legend className="field__label">Гласове</legend>
          <div className="meal-votes__people">
            {!empty &&
              users.map((user) => (
                <PersonVote key={user.id} meal={meal} user={user} />
              ))}
            {!past && (
              <OutcomeLabel
                outcome={mealOutcome(
                  meal,
                  users.map((user) => user.id),
                )}
              />
            )}
          </div>
          {!past && !empty && onVote && (
            <MyVote
              meal={meal}
              userId={voterId}
              onVote={(value) => onVote(meal, value)}
              big
            />
          )}
        </fieldset>
      )}
      {voterId && (
        <Thread
          meal={meal}
          weekStart={plan.weekStart}
          users={users}
          userId={voterId}
          readOnly={past}
        />
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
          {readOnly
            ? 'Седмицата е минала: менюто се чете, но не се сменя.'
            : 'Денят е минал: ястието и бележката не се сменят.'}
        </p>
      ) : (
        <>
          {picking ? (
            <RecipePicker
              meal={meal}
              plan={plan}
              onPick={patch}
              onRemove={removeRecipe}
            />
          ) : (
            <div className="sheet__section">
              <button
                type="button"
                className="button"
                onClick={() => setPicking(true)}
              >
                Избери сам
              </button>
            </div>
          )}
          <div className="sheet__section">
            <MealReplace
              key={meal.id}
              meal={meal}
              weekStart={plan.weekStart}
              onPick={({ recipeId, why }) => patch({ recipeId, why })}
            />
          </div>
          <NoteField key={meal.note} meal={meal} onSave={patch} />
          {voterId && <MoveMeal meal={meal} plan={plan} today={today} />}
        </>
      )}
      {!readOnly && (
        <>
          <CookPicker meal={meal} users={users} onPick={patch} />
          <ServingsEditor meal={meal} users={users} onChange={patch} />
        </>
      )}
    </Sheet>
  );
}

/** Рецептата, която „Махни ястието от деня“ е махнало, за „Върни“: с „защо“-то ѝ, ако е имала. */
export interface RemovedRecipe {
  mealId: string;
  date: DateKey;
  recipeId: string;
  why: string | null;
  title: string;
}

/**
 * „„Мусака“ е махнато от четвъртък“ с „Върни“, което връща рецептата (и „защо“-то ѝ). Живее в екрана, не в листа:
 * затварянето на листа веднага след махането не губи „Върни“.
 */
export function RemovedRecipeToast({
  removed,
  weekStart,
  onDone,
}: {
  removed: RemovedRecipe | null;
  weekStart: DateKey;
  onDone: () => void;
}) {
  const update = useUpdateMeal(weekStart);
  return (
    <>
      {update.isError && <ErrorBox error={update.error} />}
      <Toast
        message={
          removed &&
          `„${removed.title}“ е махнато от ${weekdayName(removed.date)}`
        }
        onDone={onDone}
        undo={
          removed
            ? () =>
                update.mutate({
                  id: removed.mealId,
                  patch: {
                    recipeId: removed.recipeId,
                    ...(removed.why ? { why: removed.why } : {}),
                  },
                })
            : undefined
        }
      />
    </>
  );
}

interface PickerProps {
  meal: Meal;
  plan: MealPlan;
  onPick: (change: UpdateMeal) => void;
  /** „Махни ястието от деня“: рецептата отпада, денят остава с бележката си или празен. */
  onRemove: () => void;
}

/**
 * Търсене сред вечерните рецепти с маркери „в тази седмица“ и „последните 2 седмици“; под резултатите, отделно от
 * тях, „Махни ястието от деня“, за да не се маха ястие случайно с един допир по списъка.
 */
function RecipePicker({ meal, plan, onPick, onRemove }: PickerProps) {
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
      {meal.recipeId !== null && (
        <button
          type="button"
          className="button button--quiet recipe-picker__remove"
          onClick={onRemove}
        >
          Махни ястието от деня
        </button>
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
