import { type InboxItem, inboxGroups } from '@family/shared';
import { Navigate } from '@tanstack/react-router';
import { isPersonalDevice, useDeviceMode } from '../../app/device-mode';
import { ScreenHeader } from '../../app/ScreenHeader';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { useNow } from '../../lib/use-now';
import { InboxRow } from './InboxRow';
import { useInbox, useReadAllInbox } from './queries';
import './inbox.css';

/**
 * `/inbox` (GLOSSARY: Входяща кутия): известията на действащия човек от последните 30 дни в групи „Днес“, „Вчера“ и
 * „По-рано“, последно обновените отгоре; „Всички прочетени“ горе вдясно. Само на телефона и в браузъра: kiosk и TV
 * нямат кутия и отиват на дашборда.
 */
export function InboxScreen() {
  const { mode } = useDeviceMode();
  if (!isPersonalDevice(mode)) {
    return <Navigate to="/" replace />;
  }
  return <Inbox />;
}

function Inbox() {
  const inbox = useInbox();
  const readAll = useReadAllInbox();
  const hasUnread = inbox.data?.some((item) => item.unread) ?? false;
  return (
    <main className="screen inbox">
      <ScreenHeader
        title="Входяща кутия"
        actions={
          <button
            type="button"
            className="button button--quiet"
            disabled={!hasUnread}
            onClick={() => readAll.mutate()}
          >
            Всички прочетени
          </button>
        }
      />
      {inbox.isPending ? (
        <Spinner />
      ) : inbox.isError ? (
        <ErrorBox error={inbox.error} onRetry={() => void inbox.refetch()} />
      ) : inbox.data.length === 0 ? (
        <p className="inbox__empty">Няма известия</p>
      ) : (
        <Groups items={inbox.data} />
      )}
    </main>
  );
}

function Groups({ items }: { items: InboxItem[] }) {
  // Минутата стига: „Днес“ става „Вчера“ в полунощ.
  const now = useNow(60_000);
  return inboxGroups(items, now).map(({ label, items: group }) => (
    <section key={label} className="inbox__group" aria-label={label}>
      <h2 className="inbox__group-title">{label}</h2>
      <ul className="inbox__items">
        {group.map((item) => (
          <InboxRow key={item.id} item={item} withDate={label === 'По-рано'} />
        ))}
      </ul>
    </section>
  ));
}
