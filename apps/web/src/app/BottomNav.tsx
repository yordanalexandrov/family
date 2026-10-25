import { Link } from '@tanstack/react-router';
import './BottomNav.css';

// Рецептите остават активни и в подекраните си (рецепта, редакция, предложения).
const ITEMS = [
  { to: '/', label: 'Дашборд', exact: true },
  { to: '/calendar', label: 'Календар', exact: true },
  { to: '/recipes', label: 'Рецепти', exact: false },
  { to: '/settings', label: 'Настройки', exact: true },
] as const;

/** Стъклената долна лента между основните екрани на телефона. */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Основна навигация">
      <ul className="bottom-nav__list">
        {ITEMS.map(({ to, label, exact }) => (
          <li key={to}>
            <Link
              to={to}
              className="bottom-nav__link"
              activeOptions={{ exact }}
              activeProps={{ 'aria-current': 'page' }}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
