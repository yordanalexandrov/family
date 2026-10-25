import { useEffect, useState } from 'react';
import { type EffectsSetting, useEffectsLevel } from '../../app/effects';
import { Avatar, FAMILY_AVATAR } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { TopBar, type TopBarSync } from '../../components/TopBar';
import './GlassScreen.css';

/*
 * Временна витрина на дизайн системата „Стъкло“ (#46): карти, аурора и лента в
 * двете теми и двете нива, за сравнение с прототипа. Само в dev (router.tsx).
 * `?theme=dark&effects=lite` задава началното състояние (за снимки без кликове).
 */
type ThemeChoice = 'light' | 'dark' | 'auto';

const ALL_OK: TopBarSync = {
  calendar: { status: 'ok' },
  budget: { status: 'ok' },
};

const SYNC_SAMPLES: Record<string, TopBarSync> = {
  'всичко ок': ALL_OK,
  остаряло: { calendar: { status: 'stale' }, budget: { status: 'failed' } },
  'без конфигурация': {
    calendar: { status: 'ok' },
    budget: { status: 'unconfigured' },
  },
};

const money = new Intl.NumberFormat('bg-BG', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function applyTheme(theme: ThemeChoice) {
  if (theme === 'auto') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function GlassScreen() {
  const { level, setting, setEffects } = useEffectsLevel();
  const [theme, setTheme] = useState<ThemeChoice>(
    () =>
      (document.documentElement.dataset.theme as ThemeChoice | undefined) ??
      'auto',
  );
  const [sample, setSample] = useState('всичко ок');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryTheme = params.get('theme');
    if (queryTheme === 'light' || queryTheme === 'dark') {
      setTheme(queryTheme);
      applyTheme(queryTheme);
    }
    const queryEffects = params.get('effects');
    if (queryEffects === 'full' || queryEffects === 'lite') {
      setEffects(queryEffects);
    }
    const querySync = params.get('sync');
    if (querySync !== null && querySync in SYNC_SAMPLES) {
      setSample(querySync);
    }
  }, [setEffects]);

  return (
    <div className="glass-demo">
      <TopBar now={new Date()} sync={SYNC_SAMPLES[sample] ?? ALL_OK} />

      <div className="glass-demo__controls">
        <Choice
          label="Тема"
          value={theme}
          options={['light', 'dark', 'auto']}
          onChange={(value) => {
            setTheme(value);
            applyTheme(value);
          }}
        />
        <Choice<EffectsSetting>
          label={`Ефекти (сега ${level})`}
          value={setting}
          options={['full', 'lite', 'auto']}
          onChange={setEffects}
        />
        <Choice
          label="Синхронизация"
          value={sample}
          options={Object.keys(SYNC_SAMPLES)}
          onChange={setSample}
        />
      </div>

      <main className="glass-demo__grid">
        <Card
          title="Бюджет"
          aside="остават до края на октомври"
          style={{ '--card-index': 1 } as React.CSSProperties}
        >
          <p className="glass-demo__money">{money.format(1284)}</p>
          <p className="glass-demo__muted">≈ 214 € на ден</p>
        </Card>

        <Card
          className="glass-demo__core"
          aria-label="Днес"
          style={{ '--card-index': 0 } as React.CSSProperties}
        >
          <p className="glass-demo__clock">10:42</p>
          <ul className="glass-demo__events">
            <li>
              <Avatar initial="Д" color="person-1" size="sm" />
              <span className="glass-demo__muted">09:30</span> Зъболекар
            </li>
            <li>
              <Avatar initial="П" color="person-2" size="sm" />
              <span className="glass-demo__muted">14:00</span> Йога
            </li>
            <li>
              <Avatar {...FAMILY_AVATAR} size="sm" />
              <span className="glass-demo__muted">18:30</span> Вечеря у баба
            </li>
          </ul>
        </Card>

        <Card
          title="Следващите дни"
          stale="Остарели данни · преди 42 мин"
          style={{ '--card-index': 2 } as React.CSSProperties}
        >
          <p>
            <b>ПН</b> <span className="glass-demo__muted">26.10</span>{' '}
            Родителска среща
          </p>
          <p>
            <b>ВТ</b> <span className="glass-demo__muted">27.10</span> —
          </p>
        </Card>

        <Card
          as="a"
          href="#glass"
          interactive
          title="Интерактивна карта"
          style={{ '--card-index': 3 } as React.CSSProperties}
        >
          <p>
            Фокус-рамка, натискане и наклон при hover (само на full с мишка).
          </p>
        </Card>

        <Card
          title="Цветовете на хората"
          style={{ '--card-index': 4 } as React.CSSProperties}
        >
          <p className="glass-demo__person" data-person="1">
            Дани
          </p>
          <p className="glass-demo__person" data-person="2">
            Поли
          </p>
          <p className="glass-demo__person" data-person="family">
            Семейство
          </p>
        </Card>
      </main>
    </div>
  );
}

interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: ChoiceProps<T>) {
  return (
    <fieldset className="glass-demo__choice">
      <legend>{label}</legend>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="glass-demo__option"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </fieldset>
  );
}
