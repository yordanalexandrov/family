import { Link } from '@tanstack/react-router';
import type { CSSProperties, ReactNode } from 'react';
import { useMe } from '../../api/queries';
import { useDeviceMode } from '../../app/device-mode';
import {
  type EffectsSetting,
  supportsBlur,
  useEffectsLevel,
} from '../../app/effects';
import { type ThemeSetting, useTheme } from '../../app/theme';
import { Avatar } from '../../components/Avatar';
import { BackLink } from '../../components/BackLink';
import { Card } from '../../components/Card';
import { DEVICE_CHOICES } from '../device/DeviceScreen';
import { NotificationsSection } from './NotificationsSection';
import './SettingsScreen.css';

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'light', label: 'Светла' },
  { value: 'dark', label: 'Тъмна' },
  { value: 'auto', label: 'Автоматично по часа' },
];

const EFFECTS: { value: EffectsSetting; label: string }[] = [
  { value: 'full', label: 'Пълни' },
  { value: 'lite', label: 'Леки' },
  { value: 'auto', label: 'Автоматично' },
];

/** Настройките на устройството: тема, ефекти, режим, „Кой си“ и „Известия“ (само телефон), версия. */
export function SettingsScreen() {
  const { setting: theme, setTheme } = useTheme();
  const { setting: effects, level, setEffects } = useEffectsLevel();
  const { mode, setMode } = useDeviceMode();
  const blur = supportsBlur();

  return (
    <main className={`settings${mode === 'phone' ? '' : ' settings--wide'}`}>
      <header className="settings__header">
        {mode === 'kiosk' && <BackLink />}
        <h1 className="settings__title">Настройки</h1>
      </header>

      <Section title="Тема" index={0}>
        <Choices
          name="theme"
          legend="Тема"
          value={theme}
          options={THEMES}
          onChange={setTheme}
        />
        <p className="settings__hint">
          Автоматично: тъмна от 20:00 до 07:00, светла през деня.
        </p>
      </Section>

      <Section title="Ефекти" index={1}>
        <Choices
          name="effects"
          legend="Ефекти"
          value={effects}
          options={EFFECTS}
          onChange={setEffects}
        />
        <p className="settings__hint">
          {blur
            ? `Сега: ${level === 'full' ? 'пълни' : 'леки'}. Леките са без размазване и с неподвижен фон.`
            : 'Браузърът не поддържа размазване, затова ефектите са автоматично леки.'}
        </p>
      </Section>

      <Section title="Устройство" index={2}>
        <Choices
          name="device"
          legend="Устройство"
          value={mode ?? 'phone'}
          options={DEVICE_CHOICES.map(({ mode: value, name, description }) => ({
            value,
            label: name,
            description,
          }))}
          onChange={setMode}
        />
      </Section>

      {mode === 'phone' && (
        <Section title="Кой си" index={3}>
          <ActingUser />
        </Section>
      )}

      {mode === 'phone' && (
        <Section title="Известия" index={4}>
          <NotificationsSection />
        </Section>
      )}

      <p className="settings__version">Версия {__APP_VERSION__}</p>
    </main>
  );
}

function ActingUser() {
  const me = useMe();
  return (
    <div className="settings__who">
      {me.data && (
        <>
          <Avatar initial={me.data.user.initial} color={me.data.user.color} />
          <span className="settings__who-name">{me.data.user.name}</span>
        </>
      )}
      <Link to="/who" className="button">
        Смени
      </Link>
    </div>
  );
}

function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      aria-label={title}
      style={{ '--card-index': index } as CSSProperties}
    >
      {children}
    </Card>
  );
}

interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

function Choices<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="settings__choices">
      <legend className="visually-hidden">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="settings__choice">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="settings__choice-text">
            <span className="settings__choice-label">{option.label}</span>
            {option.description && (
              <span className="settings__choice-description">
                {option.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
