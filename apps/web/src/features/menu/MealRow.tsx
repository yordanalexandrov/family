import {
  type DateKey,
  isPastMeal,
  type Meal,
  type MealComment,
  mealOutcome,
  mealTitle,
  totalServings,
  type User,
  type VoteValue,
} from '@family/shared';
import { Avatar } from '../../components/Avatar';
import { formatDate, formatServings, formatWeekday } from '../../lib/format';
import { MyVote, OutcomeLabel, PersonVote } from './Votes';

/** Гласуването на реда: само в телефонния изглед, с действащ потребител. */
export interface RowVoting {
  /** Действащият потребител. */
  userId: string;
  today: DateKey;
  onVote: (meal: Meal, value: VoteValue | null) => void;
}

interface MealRowProps {
  meal: Meal;
  users: User[];
  /** Без него редът е само за четене (минала седмица, kiosk). */
  onOpen?: () => void;
  /** Без него редът е без гласове (kiosk). */
  voting?: RowVoting;
}

/**
 * Един ден от менюто: ден и дата, ястието, готвачът, порциите и „защо“; на телефона и гласовете с изхода. Минал ден
 * е приглушен, без бутони за глас и без изход.
 */
export function MealRow({ meal, users, onOpen, voting }: MealRowProps) {
  const cook = users.find((user) => user.id === meal.cookUserId);
  const title = mealTitle(meal);
  const servings = totalServings(meal.servings);
  const past = voting ? isPastMeal(meal, voting.today) : false;
  const outcome = mealOutcome(
    meal.votes,
    users.map((user) => user.id),
  );
  const content = (
    <>
      <span className="meal-row__day">
        <span className="meal-row__weekday">{formatWeekday(meal.date)}</span>
        <span className="meal-row__date">{formatDate(meal.date)}</span>
      </span>
      <span className="meal-row__main">
        <span
          className={`meal-row__title${title ? '' : ' meal-row__title--empty'}`}
        >
          {title ?? (onOpen ? 'Избери ястие' : '—')}
          {meal.recipe?.archivedAt && <span className="badge">архивирана</span>}
        </span>
        {meal.recipe && meal.note && (
          <span className="meal-row__note">{meal.note}</span>
        )}
        {meal.why && <span className="meal-row__why">{meal.why}</span>}
        {meal.lastComment && (
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
          <span className="meal-row__no-cook" title="Без готвач">
            <span className="visually-hidden">Без готвач</span>
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
  const outcomeClass = voting && !past ? ` meal-row--${outcome}` : '';
  return (
    <div className={`meal-row${outcomeClass}${past ? ' meal-row--past' : ''}`}>
      {onOpen ? (
        <button type="button" className="meal-row__content" onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className="meal-row__content">{content}</div>
      )}
      {voting && (
        <div className="meal-row__votes">
          {!past && <OutcomeLabel outcome={outcome} />}
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
