import {
  type CookingMeal,
  isOneServingEach,
  totalServings,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useUsers } from '../../api/queries';
import { useWritingUserId } from '../../app/acting-user';
import { Avatar } from '../../components/Avatar';
import { formatServings } from '../../lib/format';
import { useClaimCook } from './today-actions';

interface TodayCookingProps {
  dinner: CookingMeal | null;
  /** kiosk, телефон: докосване на реда отваря менюто на тази седмица. TV: само показва. */
  opensMenu?: boolean;
  /**
   * При днешна рецепта редът отваря нея вместо менюто: телефон — изгледа на рецептата (`view`), kiosk — Готвене с
   * порциите на ястието (`cooking`).
   */
  recipeTarget?: RecipeTarget;
}

export type RecipeTarget = 'view' | 'cooking';

/**
 * Редът „Днес се готви“ в ядрото: днешната вечеря от менюто (заглавието на
 * рецептата или бележката) и под нея кой готви; без план — „Няма меню за
 * днес“. „Аз“ има само на устройство с действащ потребител (телефон, браузър);
 * kiosk и TV само показват.
 */
export function TodayCooking({
  dinner,
  opensMenu = false,
  recipeTarget,
}: TodayCookingProps) {
  const users = useUsers();
  const actor = useWritingUserId();

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
    <div className="core__cooking">
      <Row
        opensMenu={opensMenu}
        recipe={
          recipeTarget && dinner?.recipeId
            ? {
                id: dinner.recipeId,
                target: recipeTarget,
                servings: dinner.servings && totalServings(dinner.servings),
              }
            : null
        }
      >
        <small>Днес се готви</small>
        {dinner ? (
          <span className="core__cooking-meal">
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
      {dinner && <CookLine dinner={dinner} actor={actor} />}
    </div>
  );
}

/** „готви Поли“ с аватара, „готвиш ти“ или „няма готвач“ с „Аз“. */
function CookLine({
  dinner,
  actor,
}: {
  dinner: CookingMeal;
  actor: string | null;
}) {
  const users = useUsers();
  const claim = useClaimCook(actor);
  const cook = dinner.cookUserId
    ? users.data?.find((user) => user.id === dinner.cookUserId)
    : undefined;

  if (dinner.cookUserId) {
    return (
      <p className="core__cooking-line">
        {cook && <Avatar initial={cook.initial} color={cook.color} size="sm" />}
        {dinner.cookUserId === actor ? (
          <span>готвиш ти</span>
        ) : (
          cook && <span>готви {cook.name}</span>
        )}
      </p>
    );
  }
  const { mealId } = dinner;
  return (
    <p className="core__cooking-line">
      <span className="core__cooking-muted">няма готвач</span>
      {actor && mealId && (
        <button
          type="button"
          className="button core__cooking-action"
          disabled={claim.isPending}
          onClick={() => claim.mutate(mealId)}
        >
          Аз
        </button>
      )}
    </p>
  );
}

interface RowRecipe {
  id: string;
  target: RecipeTarget;
  /** Порциите на ястието; без тях (по-стар сървър) или при 0 Готвене е с порциите на рецептата. */
  servings: number | undefined;
}

function Row({
  opensMenu,
  recipe,
  children,
}: {
  opensMenu: boolean;
  recipe: RowRecipe | null;
  children: ReactNode;
}) {
  if (!opensMenu) {
    return <div className="core__cooking-main">{children}</div>;
  }
  if (recipe?.target === 'cooking') {
    return (
      <Link
        to="/recipes/$id/cook"
        params={{ id: recipe.id }}
        search={recipe.servings ? { servings: recipe.servings } : {}}
        className="core__cooking-main core__cooking--link"
      >
        {children}
      </Link>
    );
  }
  if (recipe) {
    return (
      <Link
        to="/recipes/$id"
        params={{ id: recipe.id }}
        className="core__cooking-main core__cooking--link"
      >
        {children}
      </Link>
    );
  }
  // Екранът „Меню“ без параметри показва тази седмица.
  return (
    <Link to="/menu" className="core__cooking-main core__cooking--link">
      {children}
    </Link>
  );
}
