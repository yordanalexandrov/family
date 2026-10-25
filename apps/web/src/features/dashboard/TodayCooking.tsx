import type { CookingMeal, Servings, User } from '@family/shared';
import { useUsers } from '../../api/queries';
import { Avatar } from '../../components/Avatar';

interface TodayCookingProps {
  dinner: CookingMeal | null;
}

/**
 * Редът „Днес се готви“ в ядрото: днешната вечеря от менюто (заглавието на
 * рецептата или бележката) и аватарът на готвача; без план — „Няма меню за днес“.
 */
export function TodayCooking({ dinner }: TodayCookingProps) {
  const users = useUsers();
  const cook = dinner?.cookUserId
    ? users.data?.find((user) => user.id === dinner.cookUserId)
    : undefined;

  const servings = dinner?.servings;
  const extraServings =
    servings && users.data && !isDefault(servings, users.data)
      ? sum(servings)
      : null;

  return (
    <div className="core__cooking">
      <small>Днес се готви</small>
      {dinner ? (
        <span className="core__cooking-meal">
          {cook && (
            <>
              <Avatar initial={cook.initial} color={cook.color} size="sm" />
              <span className="visually-hidden">готви {cook.name}</span>
            </>
          )}
          <b>{dinner.title}</b>
        </span>
      ) : (
        <span className="core__cooking-empty">Няма меню за днес</span>
      )}
      {extraServings !== null && (
        <span className="core__cooking-servings">
          {extraServings} {extraServings === 1 ? 'порция' : 'порции'}
        </span>
      )}
    </div>
  );
}

/** Подразбирането на ново ястие (api): по 1 порция за всеки потребител. */
function isDefault(servings: Servings, users: User[]): boolean {
  return (
    Object.keys(servings).length === users.length &&
    users.every((user) => servings[user.id] === 1)
  );
}

function sum(servings: Servings): number {
  return Object.values(servings).reduce((total, n) => total + n, 0);
}
