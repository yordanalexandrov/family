import type { Freshness, SyncSource } from '@family/shared';
import './TopBar.css';

/*
 * Горната лента на дашборда: вляво датата, вдясно по една точка за всеки източник.
 * `sync` е обектът от `GET /api/dashboard`; тук се ползва само `status`, затова и
 * по-тесен обект (витрината в /dev/glass) става.
 */
export type TopBarSync = Record<SyncSource, { status: Freshness }>;

interface TopBarProps {
  now: Date;
  /** kiosk, TV: по една точка за източник. Телефонът я няма: състоянието е на картите. */
  sync?: TopBarSync;
}

const SOURCES: { source: SyncSource; name: string }[] = [
  { source: 'calendar', name: 'Календар' },
  { source: 'budget', name: 'Бюджет' },
];

const STATES: Record<
  Freshness,
  { label: string; tone: 'ok' | 'stale' | 'off' }
> = {
  ok: { label: 'актуални данни', tone: 'ok' },
  stale: { label: 'остарели данни', tone: 'stale' },
  failed: { label: 'неуспешна синхронизация', tone: 'stale' },
  unconfigured: { label: 'не е конфигуриран', tone: 'off' },
};

const dateFormat = new Intl.DateTimeFormat('bg-BG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Sofia',
});

export function TopBar({ now, sync }: TopBarProps) {
  return (
    <header className="top-bar">
      <p className="top-bar__date">{dateFormat.format(now)}</p>
      {sync && (
        <ul className="top-bar__sync" aria-label="Синхронизация">
          {SOURCES.map(({ source, name }) => {
            const { label, tone } = STATES[sync[source].status];
            return (
              <li key={source}>
                <span
                  className="top-bar__source"
                  role="img"
                  aria-label={`${name}: ${label}`}
                  data-tone={tone}
                >
                  <span className="top-bar__dot" />
                  <span className="top-bar__name">{name}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </header>
  );
}
