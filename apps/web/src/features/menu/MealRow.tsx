import type { Meal, User } from '@family/shared';
import { Avatar } from '../../components/Avatar';
import { formatDate, formatWeekday } from '../../lib/format';
import { mealTitle, totalServings } from './meal';

interface MealRowProps {
  meal: Meal;
  users: User[];
  /** Без него редът е само за четене (минала седмица). */
  onOpen?: () => void;
}

/** Един ден от менюто: ден и дата, ястието, готвачът, порциите и „защо“. */
export function MealRow({ meal, users, onOpen }: MealRowProps) {
  const cook = users.find((user) => user.id === meal.cookUserId);
  const title = mealTitle(meal);
  const servings = totalServings(meal);
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
        <span className="meal-row__servings">{servingsLabel(servings)}</span>
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className="meal-row" onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className="meal-row">{content}</div>
  );
}

function servingsLabel(count: number): string {
  return count === 1 ? '1 порция' : `${count} порции`;
}
