import './TopBar.css';

/*
 * Горната лента на дашборда: вляво датата, вдясно по една точка за всеки източник.
 * `sync` е обектът от `GET /api/dashboard` (Дашборд 1); тук се ползва само `status`,
 * за да не зависи лентата от останалите полета.
 */
type SyncState = 'ok' | 'stale' | 'failed' | 'unconfigured';
type SyncSource = 'calendar' | 'budget';

export type TopBarSync = Record<SyncSource, { status: SyncState }>;

interface TopBarProps {
  now: Date;
  sync: TopBarSync;
}

const SOURCES: { source: SyncSource; name: string }[] = [
  { source: 'calendar', name: 'Календар' },
  { source: 'budget', name: 'Бюджет' },
];

const STATES: Record<
  SyncState,
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
    </header>
  );
}
