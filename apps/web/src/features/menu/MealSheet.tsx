import {
  addDays,
  type DateKey,
  isEmptyMeal,
  isPastMeal,
  MENU_REWORKING_MESSAGE,
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
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Sheet } from '../../components/Sheet';
import { useSheetHistory } from '../../components/sheet-history';
import { ACTION_DURATION_MS, Toast } from '../../components/Toast';
import { formatDayLong } from '../../lib/format';
import { ChangeTools, ReplaceMeal } from './ChangeTools';
import { MealShopping } from './MealShopping';
import { useRestoreMeal, useUpdateMeal } from './queries';
import { systemLineText, Thread } from './Thread';
import { MyVote, OutcomeLabel, PersonVote, voteOf } from './Votes';

/** Колко стои „✓ Сменено“ под заглавието: колкото toast-а с „Върни“. */
const CHANGED_MS = ACTION_DURATION_MS;

interface MealSheetProps {
  meal: Meal;
  plan: MealPlan;
  users: User[];
  today: DateKey;
  /** Минала седмица: всичко се чете (и разговорът), нищо не се сменя. */
  readOnly?: boolean;
  /**
   * AI преработва менюто: гласът, разговорът, ястието, бележката и преместването чакат; готвачът и порциите не.
   */
  locked?: boolean;
  /** Действащият потребител, който гласува; без него листът е без гласове и разговор. */
  voterId?: string;
  onVote?: (meal: Meal, value: VoteValue | null) => void;
  /** „Махни ястието от деня“ е минало: екранът показва toast-а с „Върни“, който остава и след затварянето на листа. */
  onRecipeRemoved: (removed: RemovedRecipe) => void;
  onClose: () => void;
}

/** Под-изгледите на листа: всеки се отваря от своя ред в прегледа и се връща с „‹ Назад“. */
type MealView = 'thread' | 'cook' | 'servings' | 'change';

/**
 * Потвърждението след смяна на ястието: какво е било (`null` на празен ден) и дали може да се върне („Върни“ има само
 * след смяна на рецептата, не след бележка или размяна). `at` различава две поредни смени, за да светне пак заглавието.
 */
interface MealChanged {
  before: string | null;
  undo: boolean;
  at: number;
}

const VIEW_TITLES: Record<MealView, string> = {
  thread: 'Разговор',
  cook: 'Готвач',
  servings: 'Порции',
  change: 'Смени ястието',
};

/**
 * Листът на едно ястие като преглед от редове (спек #366): отгоре заглавието (връзка към рецептата) и „защо“, после
 * въпросът „Става ли за теб?“ (докато не съм гласувал) или редът „Гласове“, а под тях редовете Разговор, Готвач,
 * Порции, превключвателят за списъка за пазаруване и „↻ Смени ястието“. Редовете със „›“ отварят свой под-изглед в
 * същия лист; той е запис в историята, затова „назад“ връща към прегледа. Минал ден пази ястието и бележката, а
 * готвачът и порциите се сменят; разговорът му се чете. В минала седмица (`readOnly`) не се сменят и те. Празен ден
 * (без рецепта и бележка) е без гласове: вместо тях е „Какво ще ядем?“. Махнатата рецепта отива в `onRecipeRemoved`.
 */
export function MealSheet({
  meal,
  plan,
  users,
  today,
  readOnly = false,
  locked = false,
  voterId,
  onVote,
  onRecipeRemoved,
  onClose,
}: MealSheetProps) {
  const update = useUpdateMeal(plan.weekStart);
  const restore = useRestoreMeal(plan.weekStart);
  const [view, setView] = useState<MealView | null>(null);
  const [changed, setChanged] = useState<MealChanged | null>(null);
  const day = formatDayLong(meal.date);
  const title = mealTitle(meal);
  const past = readOnly || isPastMeal(meal, today);
  // Празен ден чака ястие, не глас: без въпроса и реда „Гласове“.
  const empty = isEmptyMeal(meal);
  const canChange = !past && !locked;
  const mine = voterId ? voteOf(meal, voterId) : undefined;
  const vote = onVote && ((value: VoteValue | null) => onVote(meal, value));
  const askVote = voterId !== undefined && vote && !past && !empty && !mine;
  const showOverview = useCallback(() => setView(null), []);
  const clearChanged = useCallback(() => setChanged(null), []);
  // `readOnly` е и седмица, която само устройството не сменя (kiosk): тогава без бележка.
  const note = readOnly
    ? addDays(plan.weekStart, 6) < today
      ? 'Седмицата е минала: менюто се чете, но не се сменя.'
      : null
    : past
      ? 'Денят е минал: ястието и бележката не се сменят.'
      : locked
        ? MENU_REWORKING_MESSAGE
        : null;

  /** Всяка промяна на ястието от листа; `onSuccess` е какво следва, щом мине. */
  function patch(change: UpdateMeal, onSuccess?: () => void) {
    update.mutate(
      { id: meal.id, patch: change },
      onSuccess ? { onSuccess } : undefined,
    );
  }

  /**
   * Смяна на ястието (рецепта, бележка): след успеха листът се връща към прегледа с „✓ Сменено“. „Върни“ има само след
   * смяна на рецептата: api-то пази снимка само за нея.
   */
  function changeMeal(change: UpdateMeal) {
    const undo = change.recipeId !== undefined;
    patch(change, () => mealChanged(undo));
  }

  /** Тук `title` още е на ястието отпреди смяната: то е „беше“. */
  function mealChanged(undo = false) {
    restore.reset();
    setChanged({ before: title, undo, at: Date.now() });
    showOverview();
  }

  function undoChange() {
    setChanged(null);
    restore.mutate(meal.id);
  }

  function removeRecipe() {
    const before: RemovedRecipe = {
      mealId: meal.id,
      date: meal.date,
      title: title ?? '',
    };
    patch({ recipeId: null }, () => {
      showOverview();
      onRecipeRemoved(before);
    });
  }

  const tools = (
    <ChangeTools
      meal={meal}
      plan={plan}
      today={today}
      swap={voterId !== undefined}
      replace={!empty}
      onChange={changeMeal}
      onSwapped={() => mealChanged()}
      // „Махни ястието от деня“ само за ястие с рецепта: бележка без рецепта се сменя, не се маха.
      onRemove={meal.recipeId !== null ? removeRecipe : undefined}
    />
  );

  return (
    <Sheet title={day} onClose={onClose}>
      {update.isError && <ErrorBox error={update.error} />}
      {restore.isError && <ErrorBox error={restore.error} />}
      {view ? (
        <SubView title={VIEW_TITLES[view]} onBack={showOverview}>
          {view === 'thread' && voterId && (
            <Thread
              meal={meal}
              weekStart={plan.weekStart}
              users={users}
              userId={voterId}
              readOnly={past || locked}
            />
          )}
          {view === 'cook' && (
            <CookPicker
              meal={meal}
              users={users}
              onPick={(change) => patch(change, showOverview)}
            />
          )}
          {view === 'servings' && (
            <ServingsEditor meal={meal} users={users} onChange={patch} />
          )}
          {view === 'change' && tools}
        </SubView>
      ) : (
        <>
          <div className="sheet__section meal-sheet__head">
            <h3
              key={changed?.at}
              className={`meal-sheet__title${title ? '' : ' meal-sheet__title--empty'}${changed ? ' meal-sheet__title--changed' : ''}`}
            >
              {meal.recipeId !== null ? (
                <Link
                  to="/recipes/$id"
                  params={{ id: meal.recipeId }}
                  className="meal-sheet__title-link"
                >
                  {title}
                  <span aria-hidden="true" className="meal-sheet__chevron">
                    ›
                  </span>
                </Link>
              ) : (
                (title ?? 'Още няма ястие')
              )}
            </h3>
            <ChangedStatus
              changed={changed}
              title={title}
              onUndo={undoChange}
              onDone={clearChanged}
            />
            {meal.why && <p className="meal-sheet__why">{meal.why}</p>}
          </div>
          {askVote && (
            <fieldset
              className="sheet__section meal-sheet__ask"
              aria-labelledby="meal-sheet-ask"
            >
              <p id="meal-sheet-ask" className="meal-sheet__ask-question">
                Става ли за теб?
              </p>
              <MyVote
                meal={meal}
                userId={voterId}
                onVote={vote}
                big
                disabled={locked}
              />
            </fieldset>
          )}
          {empty && canChange && (
            <section
              className="sheet__section meal-sheet__empty"
              aria-labelledby="meal-sheet-empty"
            >
              <h4 id="meal-sheet-empty" className="meal-sheet__group-title">
                Какво ще ядем?
              </h4>
              <ReplaceMeal
                meal={meal}
                plan={plan}
                askLabel="✨ Предложи ястие"
                onChange={changeMeal}
              />
              {tools}
            </section>
          )}
          <div className="sheet__section meal-sheet__rows">
            {voterId && !empty && !askVote && (
              <fieldset
                className="meal-sheet__row meal-sheet__row--static"
                aria-label="Гласове"
              >
                <span className="meal-sheet__row-label">Гласове</span>
                <span className="meal-sheet__row-value meal-sheet__votes">
                  {users.map((user) => (
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
                  {!past && vote && (
                    <MyVote
                      meal={meal}
                      userId={voterId}
                      onVote={vote}
                      disabled={locked}
                    />
                  )}
                </span>
              </fieldset>
            )}
            {voterId && (
              <MealSheetRow
                label="Разговор"
                onOpen={() => setView('thread')}
                value={
                  <ThreadPreview
                    meal={meal}
                    users={users}
                    canWrite={!past && !locked}
                  />
                }
              />
            )}
            <MealSheetRow
              label="Готвач"
              value={<CookValue meal={meal} users={users} />}
              {...(readOnly ? {} : { onOpen: () => setView('cook') })}
            />
            <MealSheetRow
              label="Порции"
              value={servingsText(meal, users)}
              {...(readOnly ? {} : { onOpen: () => setView('servings') })}
            />
            {meal.recipeId !== null && !readOnly && (
              <MealShopping meal={meal} weekStart={plan.weekStart} />
            )}
            {canChange && !empty && (
              <MealSheetRow
                label="↻ Смени ястието"
                onOpen={() => setView('change')}
              />
            )}
          </div>
          {note && <p className="sheet__section meal-sheet__note">{note}</p>}
        </>
      )}
    </Sheet>
  );
}

/**
 * Под-изгледът на листа: „‹ Назад“, заглавието и съдържанието. Отвореният под-изглед е запис в историята (като лист
 * над листа): „назад“ на телефона го затваря и връща към прегледа, а листът остава.
 */
function SubView({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  useSheetHistory(onBack);
  return (
    <section className="sheet__section meal-sheet__view" aria-label={title}>
      <button type="button" className="meal-sheet__back" onClick={onBack}>
        <span aria-hidden="true">‹</span> Назад
      </button>
      <h3 className="meal-sheet__view-title">{title}</h3>
      {children}
    </section>
  );
}

/**
 * „✓ Сменено (беше „Мусака“)“ под заглавието за `CHANGED_MS`, с „Върни“ след смяна на рецептата. Живата област стои
 * винаги, за да прочете екранният четец новия текст.
 */
function ChangedStatus({
  changed,
  title,
  onUndo,
  onDone,
}: {
  changed: MealChanged | null;
  /** Сегашното заглавие: бележка към ястие с рецепта не го сменя и тогава „беше“ няма. */
  title: string | null;
  onUndo: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!changed) {
      return;
    }
    const timer = setTimeout(onDone, CHANGED_MS);
    return () => clearTimeout(timer);
  }, [changed, onDone]);

  return (
    <div className="meal-sheet__changed" role="status" aria-live="polite">
      {changed && (
        <>
          <span>
            ✓ Сменено
            {changed.before && changed.before !== title
              ? ` (беше „${changed.before}“)`
              : ''}
          </span>
          {changed.undo && (
            <button type="button" className="meal-sheet__undo" onClick={onUndo}>
              Върни
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Ред от прегледа: етикет, стойност и „›“, ако отваря под-изглед; без `onOpen` само се чете. */
function MealSheetRow({
  label,
  value,
  onOpen,
}: {
  label: string;
  value?: ReactNode;
  onOpen?: () => void;
}) {
  const content = (
    <>
      <span className="meal-sheet__row-label">{label}</span>
      <span className="meal-sheet__row-value">{value}</span>
    </>
  );
  if (!onOpen) {
    return (
      <div className="meal-sheet__row meal-sheet__row--static">{content}</div>
    );
  }
  return (
    <button type="button" className="meal-sheet__row" onClick={onOpen}>
      {content}
      <span className="meal-sheet__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** Стойността на реда „Разговор“: броят редове и последният, или подкана, ако още е празен. */
function ThreadPreview({
  meal,
  users,
  canWrite,
}: {
  meal: Meal;
  users: User[];
  canWrite: boolean;
}) {
  const line = meal.lastComment;
  if (!line) {
    return canWrite ? 'Напиши нещо…' : 'Няма коментари';
  }
  const name =
    users.find((user) => user.id === line.authorUserId)?.name ?? 'Някой';
  return (
    <>
      <span className="meal-sheet__comment">
        {line.kind === 'system'
          ? systemLineText(line, name)
          : `${name}: ${line.body}`}
      </span>
      <span className="meal-sheet__comment-count">
        <span aria-hidden="true">💬</span> {meal.commentCount}
        <span className="visually-hidden"> в разговора</span>
      </span>
    </>
  );
}

function CookValue({ meal, users }: { meal: Meal; users: User[] }) {
  const cook = users.find((user) => user.id === meal.cookUserId);
  if (!cook) {
    return 'никой';
  }
  return (
    <>
      <Avatar initial={cook.initial} color={cook.color} size="sm" />
      {cook.name}
    </>
  );
}

/** „3 (Дани 2, Поли 1)“: общо и по човек. */
function servingsText(meal: Meal, users: User[]): string {
  const total = Object.values(meal.servings).reduce((a, b) => a + b, 0);
  const each = users
    .map((user) => `${user.name} ${meal.servings[user.id] ?? 0}`)
    .join(', ');
  return `${total} (${each})`;
}

/** Рецептата, която „Махни ястието от деня“ е махнало, за toast-а с „Върни“; какво се връща пази api-то. */
export interface RemovedRecipe {
  mealId: string;
  date: DateKey;
  title: string;
}

/**
 * „„Мусака“ е махнато от четвъртък“ с „Върни“, което връща рецептата, „защо“-то ѝ и гласовете, без нов ред в
 * разговора. Живее в екрана, не в листа: затварянето на листа веднага след махането не губи „Върни“.
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
  const restore = useRestoreMeal(weekStart);
  return (
    <>
      {restore.isError && <ErrorBox error={restore.error} />}
      <Toast
        message={
          removed &&
          `„${removed.title}“ е махнато от ${weekdayName(removed.date)}`
        }
        onDone={onDone}
        undo={removed ? () => restore.mutate(removed.mealId) : undefined}
      />
    </>
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
    <fieldset className="meal-sheet__fieldset" aria-label="Готвач">
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
    <fieldset className="meal-sheet__fieldset" aria-label="Порции">
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
