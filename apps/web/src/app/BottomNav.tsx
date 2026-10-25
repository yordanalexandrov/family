import { Link } from '@tanstack/react-router';
import './BottomNav.css';

const ITEMS = [
  { to: '/', label: 'Дашборд' },
  { to: '/calendar', label: 'Календар' },
  { to: '/settings', label: 'Настройки' },
] as const;

/** Стъклената долна лента между трите екрана. */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Основна навигация">
      <ul className="bottom-nav__list">
        {ITEMS.map(({ to, label }) => (
          <li key={to}>
            <Link
              to={to}
              className="bottom-nav__link"
              activeOptions={{ exact: true }}
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
