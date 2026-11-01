import {
  type DateKey,
  isEmptyMeal,
  isPastMeal,
  type Meal,
  type MealComment,
  mealOutcome,
  mealTitle,
  type Rating,
  totalServings,
  type User,
  type VoteValue,
} from '@family/shared';
import type { ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import {
  formatServings,
  formatShortDate,
  formatWeekday,
} from '../../lib/format';
import { RatingStars } from '../recipes/Stars';
import { MyVote, OutcomeLabel, PersonVote } from './Votes';

/** Id-то на реда на ястието: `MenuWeek` превърта до него, когато листът му е отворен от адреса (`?meal=`). */
export function mealRowId(mealId: string): string {
  return `meal-row-${mealId}`;
}

/** Гласуването на реда: само в телефонния изглед, с действащ потребител. */
export interface RowVoting {
  /** Действащият потребител. */
  userId: string;
  today: DateKey;
  onVote: (meal: Meal, value: VoteValue | null) => void;
  /** Оценка на рецептата на отминало ястие („Как беше?“). */
  onRate: (recipeId: string, rating: Rating | null) => void;
}

interface MealRowProps {
  meal: Meal;
  users: User[];
  /** Без него редът не се отваря (kiosk, TV). */
  onOpen?: () => void;
  /** Без него редът е без гласове и без разговор (kiosk, TV): изглежда както преди съгласуването. */
  voting?: RowVoting;
  /** Дръжката за влачене (`MealDrag`): в реда с гласовете, а на празен ден в края на единствения ред. */
  handle?: ReactNode;
  /** Ястието е в списъка за пазаруване (GLOSSARY: Ястие в списъка): малък 🛒 до заглавието. */
  listed?: boolean;
}

/**
 * Един ден от менюто: ден и дата, ястието, готвачът, порциите и „защо“; на телефона и гласовете с изхода и последният
 * ред от разговора. Заглавието е до 3 реда, а „защо“ на 1 ред (с „…“): целите са в листа на ястието. Минал ден е приглушен, без бутони за глас и без изход; празен ден е без гласове и без изход: чака ястие. Под минало ястие с неоценена рецепта
 * телефонът пита „Как беше?“: оценката е на рецептата, не на ястието, затова денят остава само за четене.
 */
export function MealRow({
  meal,
  users,
  onOpen,
  voting,
  handle,
  listed = false,
}: MealRowProps) {
  const cook = users.find((user) => user.id === meal.cookUserId);
  const title = mealTitle(meal);
  const servings = totalServings(meal.servings);
  const past = voting ? isPastMeal(meal, voting.today) : false;
  const outcome = mealOutcome(
    meal,
    users.map((user) => user.id),
  );
  // Празен ден чака ястие, не глас (GLOSSARY: Изход на ястие): без гласове, нито моите 👎/👍, нито чиповете.
  const empty = isEmptyMeal(meal);
  const content = (
    <>
      <span className="meal-row__day">
        <span className="meal-row__weekday">{formatWeekday(meal.date)}</span>{' '}
        <span className="meal-row__date">{formatShortDate(meal.date)}</span>
      </span>
      <span className="meal-row__main">
        <span
          className={`meal-row__title${title ? '' : ' meal-row__title--empty'}`}
        >
          <span className="meal-row__title-text">
            {title ?? (onOpen && !past ? 'Избери ястие' : '—')}
          </span>
          {listed && (
            <span
              className="meal-row__listed"
              role="img"
              aria-label="в списъка за пазаруване"
            >
              🛒
            </span>
          )}
          {meal.recipe?.archivedAt && <span className="badge">архивирана</span>}
        </span>
        {meal.recipe && meal.note && (
          <span className="meal-row__note">{meal.note}</span>
        )}
        {meal.why && <span className="meal-row__why">{meal.why}</span>}
        {voting && meal.lastComment && (
          <LastComment
            line={meal.lastComment}
            count={meal.commentCount}
            users={users}
          />
        )}
      </span>
      <span className="meal-row__side">
        {cook ? (
          <span className="meal-row__cook" title={`Готви ${cook.name}`}>
            <Avatar initial={cook.initial} color={cook.color} size="sm" />
            <span className="visually-hidden">Готви {cook.name}</span>
          </span>
        ) : (
          <span className="meal-row__no-cook">
            <NoCookIcon />
            Без готвач
          </span>
        )}
        <span className="meal-row__servings">{formatServings(servings)}</span>
      </span>
    </>
  );
  const others = voting
    ? users.filter((user) => user.id !== voting.userId)
    : [];
  const me = voting && users.find((user) => user.id === voting.userId);
  const outcomeClass =
    voting && !past && outcome ? ` meal-row--${outcome}` : '';
  // „Как беше?“ под отминало ястие с рецепта, която още няма оценка.
  const rateRecipeId =
    voting && past && meal.recipe?.rating === null ? meal.recipeId : null;
  // Празен ден е без гласове, затова е един ред: дръжката е в края на реда, не сама на втори ред.
  const oneLine = voting && empty;
  return (
    <div
      id={mealRowId(meal.id)}
      className={`meal-row${outcomeClass}${past ? ' meal-row--past' : ''}${oneLine ? ' meal-row--one-line' : ''}`}
    >
      {onOpen ? (
        <button type="button" className="meal-row__content" onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className="meal-row__content">{content}</div>
      )}
      {oneLine && handle}
      {voting && !oneLine && (
        <div className="meal-row__votes">
          {handle ? (
            <span className="meal-row__lead">
              {handle}
              {!past && <OutcomeLabel outcome={outcome} />}
            </span>
          ) : (
            !past && <OutcomeLabel outcome={outcome} />
          )}
          <span className="meal-row__people">
            {others.map((user) => (
              <PersonVote key={user.id} meal={meal} user={user} />
            ))}
            {past ? (
              me && <PersonVote meal={meal} user={me} />
            ) : (
              <MyVote
                meal={meal}
                userId={voting.userId}
                onVote={(value) => voting.onVote(meal, value)}
              />
            )}
          </span>
        </div>
      )}
      {voting && rateRecipeId !== null && (
        <div className="meal-row__rate">
          <span aria-hidden="true">Как беше?</span>
          <RatingStars
            label="Как беше?"
            rating={null}
            onRate={(rating) => voting.onRate(rateRecipeId, rating)}
          />
        </div>
      )}
    </div>
  );
}

/** Последният ред от разговора, на един ред: „Поли: пак пиле?“ или „Дани смени …“, и броят редове. */
function LastComment({
  line,
  count,
  users,
}: {
  line: MealComment;
  count: number;
  users: User[];
}) {
  const name =
    users.find((user) => user.id === line.authorUserId)?.name ?? 'Някой';
  return (
    <span className="meal-row__comment">
      <span
        className={`meal-row__comment-text${line.kind === 'system' ? ' meal-row__comment-text--system' : ''}`}
      >
        {line.kind === 'system'
          ? `${name} ${line.body}`
          : `${name}: ${line.body}`}
      </span>
      <span className="meal-row__comment-count">
        <span aria-hidden="true">💬</span> {count}
        <span className="visually-hidden"> в разговора</span>
      </span>
    </span>
  );
}

/** Силует на човек: „Без готвач“ (празен пунктиран кръг не се разбира). */
function NoCookIcon() {
  return (
    <svg
      className="meal-row__no-cook-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </svg>
  );
}
