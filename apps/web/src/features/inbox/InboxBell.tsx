import { Link } from '@tanstack/react-router';
import { useWritingUserId } from '../../app/acting-user';
import { useInboxUnreadCount } from './queries';
import './inbox.css';

/** „Входяща кутия · 3 непрочетени“: името на камбанката казва и бройката, която се вижда. */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Входяща кутия · ${unread} непрочетени` : 'Входяща кутия';
}

/** „9+“ над 9, за да остане кръгчето малко. */
function badgeText(unread: number): string {
  return unread > 9 ? '9+' : String(unread);
}

/**
 * Камбанката (GLOSSARY: Входяща кутия) преди аватара на действащия човек, в `ScreenHeader` и в `TopBar` на дашборда:
 * води към `/inbox` и носи бройката на непрочетените (скрита при 0). Без действащ човек (kiosk, TV) я няма.
 */
export function InboxBell() {
  const userId = useWritingUserId();
  const unread = useInboxUnreadCount().data ?? 0;
  if (userId === null) {
    return null;
  }
  return (
    <Link to="/inbox" className="inbox-bell" aria-label={bellLabel(unread)}>
      <svg className="inbox-bell__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
        <path d="M10 21a2.2 2.2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span className="inbox-bell__count" aria-hidden="true">
          {badgeText(unread)}
        </span>
      )}
    </Link>
  );
}
