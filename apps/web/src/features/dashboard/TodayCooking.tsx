import type { CookingMeal, Servings, User } from '@family/shared';
import { useRouter } from '@tanstack/react-router';
import type { MouseEvent, ReactNode } from 'react';
import { useUsers } from '../../api/queries';
import { Avatar } from '../../components/Avatar';

interface TodayCookingProps {
  dinner: CookingMeal | null;
  /** kiosk, телефон: докосване на реда отваря менюто на тази седмица. TV: само показва. */
  opensMenu?: boolean;
}

/** Екранът „Меню“ (Меню 3); без `weekStart` показва тази седмица. */
const MENU_HREF = '/menu';

/**
 * Редът „Днес се готви“ в ядрото: днешната вечеря от менюто (заглавието на
 * рецептата или бележката) и аватарът на готвача; без план — „Няма меню за днес“.
 */
export function TodayCooking({ dinner, opensMenu = false }: TodayCookingProps) {
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
    <Row opensMenu={opensMenu}>
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
    </Row>
  );
}

function Row({
  opensMenu,
  children,
}: {
  opensMenu: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  if (!opensMenu) {
    return <div className="core__cooking">{children}</div>;
  }
  // Обикновена връзка с навигация през router-а: маршрутът `/menu` идва от Меню 3,
  // а типизираният `<Link to>` иска регистриран маршрут.
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void router.navigate({ href: MENU_HREF });
  };
  return (
    <a
      href={MENU_HREF}
      className="core__cooking core__cooking--link"
      onClick={open}
    >
      {children}
    </a>
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
