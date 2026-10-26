import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import './BottomNav.css';

// Рецептите остават активни и в подекраните си (рецепта, редакция, предложения).
const ITEMS = [
  { to: '/', label: 'Дашборд', exact: true },
  { to: '/calendar', label: 'Календар', exact: true },
  { to: '/recipes', label: 'Рецепти', exact: false },
  { to: '/menu', label: 'Меню', exact: true },
  { to: '/shopping', label: 'Пазаруване', exact: true },
  { to: '/settings', label: 'Настройки', exact: true },
] as const;

/**
 * Стъклената долна лента между основните екрани на телефона. На тесен телефон шестте екрана не се събират и
 * лентата се превърта настрани; текущият екран се държи видим.
 */
export function BottomNav() {
  const listRef = useRef<HTMLUListElement>(null);
  const pathname = useLocation({ select: (location) => location.pathname });
  // biome-ignore lint/correctness/useExhaustiveDependencies: при всяка смяна на екрана
  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (list && link && list.scrollWidth > list.clientWidth) {
      // Само лентата се превърта (не страницата): текущият екран в средата.
      list.scrollLeft =
        link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
    }
  }, [pathname]);

  return (
    <nav className="bottom-nav" aria-label="Основна навигация">
      <ul ref={listRef} className="bottom-nav__list">
        {ITEMS.map(({ to, label, exact }) => (
          <li key={to}>
            <Link
              to={to}
              className="bottom-nav__link"
              activeOptions={{ exact, includeSearch: false }}
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
