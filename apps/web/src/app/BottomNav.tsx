import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import './BottomNav.css';

// Рецептите остават активни и в подекраните си (рецепта, редакция, предложения).
const ITEMS = [
  { to: '/', label: 'Дашборд', exact: true, icon: <HomeIcon /> },
  { to: '/calendar', label: 'Календар', exact: true, icon: <CalendarIcon /> },
  { to: '/recipes', label: 'Рецепти', exact: false, icon: <BookIcon /> },
  { to: '/menu', label: 'Меню', exact: true, icon: <CutleryIcon /> },
  { to: '/shopping', label: 'Пазаруване', exact: true, icon: <CartIcon /> },
  { to: '/pantry', label: 'Килер', exact: true, icon: <JarIcon /> },
  { to: '/settings', label: 'Настройки', exact: true, icon: <GearIcon /> },
] as const;

/**
 * Стъклената долна лента между основните екрани на телефона. Всеки екран е икона; само текущият показва и
 * надписа си, затова седемте се събират и на 360 px. Иконите без надпис носят името си в `aria-label`.
 */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Основна навигация">
      <ul className="bottom-nav__list">
        {ITEMS.map(({ to, label, exact, icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="bottom-nav__link"
              activeOptions={{ exact, includeSearch: false }}
              activeProps={{ 'aria-current': 'page' }}
              inactiveProps={{ 'aria-label': label }}
            >
              {({ isActive }) => (
                <>
                  {icon}
                  {isActive && (
                    <span className="bottom-nav__label">{label}</span>
                  )}
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9v11.5h4.5v-6h4v6h4.5V9" />
    </Icon>
  );
}

function CalendarIcon() {
  return (
    <Icon>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  );
}

function BookIcon() {
  return (
    <Icon>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14.5H6.5A1.5 1.5 0 0 0 5 19V4.5z" />
      <path d="M5 19a1.5 1.5 0 0 0 1.5 1.5H19v-3M9 7.5h6" />
    </Icon>
  );
}

function CutleryIcon() {
  return (
    <Icon>
      <path d="M5 3v5a2.5 2.5 0 0 0 5 0V3M7.5 3v18" />
      <path d="M18 21V3c-2 1-3.5 3.5-3.5 8h3.5" />
    </Icon>
  );
}

function CartIcon() {
  return (
    <Icon>
      <path d="M2.5 3.5h2.8l2.4 11.5h10.6l2.2-8.5H6.1" />
      <circle cx="9" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </Icon>
  );
}

function JarIcon() {
  return (
    <Icon>
      <path d="M8 3h8v3H8z" />
      <path d="M8 6c-1.8.8-3 2.2-3 4.5v8A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-8c0-2.3-1.2-3.7-3-4.5" />
      <path d="M8.5 12.5h7" />
    </Icon>
  );
}

function GearIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.4h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4z" />
    </Icon>
  );
}
