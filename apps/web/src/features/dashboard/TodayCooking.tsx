import {
  type CookingMeal,
  isOneServingEach,
  totalServings,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useUsers } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { formatServings } from '../../lib/format';

interface TodayCookingProps {
  dinner: CookingMeal | null;
  /** kiosk, телефон: докосване на реда отваря менюто на тази седмица. TV: само показва. */
  opensMenu?: boolean;
}

/**
 * Редът „Днес се готви“ в ядрото: днешната вечеря от менюто (заглавието на
 * рецептата или бележката) и аватарът на готвача; без план — „Няма меню за днес“.
 */
export function TodayCooking({ dinner, opensMenu = false }: TodayCookingProps) {
  const users = useUsers();
  const cook = dinner?.cookUserId
    ? users.data?.find((user) => user.id === dinner.cookUserId)
    : undefined;

  // Порциите се показват само когато се различават от подразбирането (по 1 за всеки).
  const servings = dinner?.servings;
  const changedServings =
    servings &&
    users.data &&
    !isOneServingEach(
      servings,
      users.data.map((user) => user.id),
    )
      ? totalServings(servings)
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
      {changedServings !== null && (
        <span className="core__cooking-servings">
          {formatServings(changedServings)}
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
  if (!opensMenu) {
    return <div className="core__cooking">{children}</div>;
  }
  // Екранът „Меню“ без параметри показва тази седмица.
  return (
    <Link to="/menu" className="core__cooking core__cooking--link">
      {children}
    </Link>
  );
}
