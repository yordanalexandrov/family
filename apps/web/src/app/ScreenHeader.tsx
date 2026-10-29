import type { ReactNode } from 'react';
import { ActingUserAvatar } from './ActingUserAvatar';
import './ScreenHeader.css';

interface ScreenHeaderProps {
  title: string;
  /** Вляво от заглавието: „Назад“ в kiosk. */
  start?: ReactNode;
  /** На реда на заглавието, преди аватара: едно действие („Обнови“, „Добави“). */
  actions?: ReactNode;
  /** Ред под заглавието: няколко действия, които не се събират до него. */
  children?: ReactNode;
}

/**
 * Заглавната част на основните екрани (Календар, Рецепти, Меню, Пазаруване, Килер): заглавието вляво, аватарът
 * на действащия човек горе вдясно (A-10, A-17). Дашбордът има същия аватар в `TopBar`.
 */
export function ScreenHeader({
  title,
  start,
  actions,
  children,
}: ScreenHeaderProps) {
  return (
    <header className="screen-header">
      <div className="screen-header__row">
        {start}
        <h1 className="screen-header__title">{title}</h1>
        {actions}
        <ActingUserAvatar />
      </div>
      {children && <div className="screen-header__tools">{children}</div>}
    </header>
  );
}
