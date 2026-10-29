import { Link } from '@tanstack/react-router';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { useMe } from '../../api/queries';
import {
  type DeviceMode,
  isPersonalDevice,
  useDeviceMode,
} from '../../app/device-mode';
import {
  type EffectsSetting,
  supportsBlur,
  useEffectsLevel,
} from '../../app/effects';
import { type ThemeSetting, useTheme } from '../../app/theme';
import { Avatar } from '../../components/Avatar';
import { BackLink } from '../../components/BackLink';
import { Card } from '../../components/Card';
import { useKeepHashTargetInView } from '../../lib/use-hash-target';
import { DEVICE_CHOICES } from '../device/DeviceScreen';
import { AppliancesSection } from './AppliancesSection';
import { DeviceModeConfirm, needsConfirmation } from './DeviceModeConfirm';
import { NotificationsSection } from './NotificationsSection';
import './SettingsScreen.css';

/** „Като телефона“ на телефона и в браузъра; на kiosk и TV — неутрално „Като устройството“. */
function themes(systemLabel: string): { value: ThemeSetting; label: string }[] {
  return [
    { value: 'light', label: 'Светла' },
    { value: 'dark', label: 'Тъмна' },
    { value: 'system', label: systemLabel },
    { value: 'auto', label: 'Автоматично по часа' },
  ];
}

const EFFECTS: { value: EffectsSetting; label: string }[] = [
  { value: 'full', label: 'Пълни' },
  { value: 'lite', label: 'Леки' },
  { value: 'auto', label: 'Автоматично' },
];

/** Настройките на устройството: „Кой си“, „Известия“ и уредите на домакинството (телефон и браузър), тема, ефекти, режим, версия. */
export function SettingsScreen() {
  const { setting: theme, setTheme } = useTheme();
  const { setting: effects, level, setEffects } = useEffectsLevel();
  const { mode, setMode } = useDeviceMode();
  const current = mode ?? 'phone';
  // Режимът, който чака „Смени“ в листа за потвърждение.
  const [confirmingMode, setConfirmingMode] = useState<DeviceMode | null>(null);
  const blur = supportsBlur();
  const personal = isPersonalDevice(mode);
  const systemLabel = isPersonalDevice(current)
    ? 'Като телефона'
    : 'Като устройството';
  // „Кой си“, „Известия“ и „Уреди“ най-горе на телефона и в браузъра; появата на останалите карти започва след тях.
  const animationOffset = personal ? 3 : 0;
  // „Промени“ под „Поискай предложения“ води до `#appliances`: картата остава горе, докато „Известия“ се зарежда.
  useKeepHashTargetInView();

  return (
    <main className={`settings${mode === 'phone' ? '' : ' settings--wide'}`}>
      <header className="settings__header">
        {mode === 'kiosk' && <BackLink />}
        <h1 className="settings__title">Настройки</h1>
      </header>

      {personal && (
        <Section title="Кой си" index={0}>
          <ActingUser />
        </Section>
      )}

      {personal && (
        <Section title="Известия" index={1}>
          <NotificationsSection />
        </Section>
      )}

      {personal && (
        <Section title="Уреди" index={2} id="appliances">
          <AppliancesSection />
        </Section>
      )}

      <Section title="Тема" index={animationOffset}>
        <Choices
          name="theme"
          legend="Тема"
          value={theme}
          options={themes(systemLabel)}
          onChange={setTheme}
        />
        <p className="settings__hint">
          {systemLabel}: следва тъмния режим на устройството. По часа: тъмна от
          20:00 до 07:00, светла през деня.
        </p>
      </Section>

      <Section title="Ефекти" index={animationOffset + 1}>
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

      <Section title="Устройство" index={animationOffset + 2}>
        <Choices
          name="device"
          legend="Устройство"
          value={current}
          options={DEVICE_CHOICES.map(({ mode: value, name, description }) => ({
            value,
            label: name,
            description,
          }))}
          onChange={(next) =>
            needsConfirmation(current, next)
              ? setConfirmingMode(next)
              : setMode(next)
          }
        />
      </Section>

      {confirmingMode && (
        <DeviceModeConfirm
          from={current}
          to={confirmingMode}
          onConfirm={() => {
            setMode(confirmingMode);
            setConfirmingMode(null);
          }}
          onCancel={() => setConfirmingMode(null)}
        />
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
  id,
  children,
}: {
  title: string;
  index: number;
  /** Котва за връзка отвън, напр. `/settings#appliances`. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <Card
      id={id}
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
