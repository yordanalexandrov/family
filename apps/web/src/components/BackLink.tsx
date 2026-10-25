import { Link } from '@tanstack/react-router';

/** kiosk: „Назад“ горе на екраните извън дашборда (там няма долна навигация). */
export function BackLink() {
  return (
    <Link to="/" className="button">
      Назад
    </Link>
  );
}
