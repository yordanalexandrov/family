import { Link } from '@tanstack/react-router';

/**
 * „Поправка чака преглед“ на рецепта с отворена поправка: с `canEdit` води към редакцията с листа на поправката, без
 * (kiosk и TV нямат потребител и редакция) е само значка.
 */
export function OpenRevisionBadge({
  recipeId,
  canEdit,
}: {
  recipeId: string;
  canEdit: boolean;
}) {
  return canEdit ? (
    <Link
      to="/recipes/$id/edit"
      params={{ id: recipeId }}
      search={{ revise: true }}
      className="badge badge--revision"
    >
      Поправка чака преглед
    </Link>
  ) : (
    <span className="badge badge--revision">Поправка чака преглед</span>
  );
}
