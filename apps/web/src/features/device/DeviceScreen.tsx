import { useNavigate } from '@tanstack/react-router';
import { type KeyboardEvent, useRef } from 'react';
import { type DeviceMode, useDeviceMode } from '../../app/device-mode';
import './DeviceScreen.css';

export const DEVICE_CHOICES: {
  mode: DeviceMode;
  name: string;
  description: string;
}[] = [
  {
    mode: 'phone',
    name: 'Телефон',
    description: 'Дашборд, календар и настройки за един човек.',
  },
  {
    mode: 'browser',
    name: 'Браузър',
    description: 'Всичко като на телефона, подредено за широк екран.',
  },
  {
    mode: 'kiosk',
    name: 'Таблет в кухнята',
    description: 'Винаги включен, едър шрифт, без избор на човек.',
  },
  {
    mode: 'tv',
    name: 'Телевизор',
    description: 'Само дашбордът, с дистанционното.',
  },
];

const NEXT_KEYS = ['ArrowDown', 'ArrowRight'];
const PREVIOUS_KEYS = ['ArrowUp', 'ArrowLeft'];

export function DeviceScreen() {
  const { setMode } = useDeviceMode();
  const navigate = useNavigate();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(mode: DeviceMode) {
    setMode(mode);
    // Телефонът без действащ потребител продължава към „Кой си?“ (root layout).
    void navigate({ to: '/' });
  }

  // Телевизорът няма Tab: стрелките на дистанционното местят фокуса.
  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const step = NEXT_KEYS.includes(event.key)
      ? 1
      : PREVIOUS_KEYS.includes(event.key)
        ? -1
        : 0;
    if (step === 0) {
      return;
    }
    const current = buttons.current.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const count = DEVICE_CHOICES.length;
    const next = current === -1 ? 0 : (current + step + count) % count;
    buttons.current[next]?.focus();
    event.preventDefault();
  }

  return (
    <main className="screen device">
      <h1 className="screen__title">Какво е това устройство?</h1>
      <ul className="device__list" onKeyDown={onKeyDown}>
        {DEVICE_CHOICES.map(({ mode, name, description }, index) => (
          <li key={mode}>
            <button
              type="button"
              className="device__choice"
              ref={(element) => {
                buttons.current[index] = element;
              }}
              // biome-ignore lint/a11y/noAutofocus: телевизорът няма мишка и Tab; без фокус дистанционното не стига до бутоните
              autoFocus={index === 0}
              onClick={() => choose(mode)}
            >
              <span className="device__name">{name}</span>
              <span className="device__description">{description}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
