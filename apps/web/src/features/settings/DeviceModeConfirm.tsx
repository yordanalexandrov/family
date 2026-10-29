import { type ReactNode, useEffect, useRef } from 'react';
import { type DeviceMode, isPersonalDevice } from '../../app/device-mode';
import { Sheet } from '../../components/Sheet';
import { DEVICE_CHOICES } from '../device/DeviceScreen';

/** kiosk и TV махат навигацията (и „Кой си“, и известията): към тях се минава само с потвърждение. */
export function needsConfirmation(from: DeviceMode, to: DeviceMode): boolean {
  return from !== to && !isPersonalDevice(to);
}

const SUBJECT: Record<DeviceMode, string> = {
  phone: 'Телефонът',
  browser: 'Браузърът',
  kiosk: 'Таблетът',
  tv: 'Телевизорът',
};

const BECOMES: Record<DeviceMode, string> = {
  phone: 'телефон',
  browser: 'браузър',
  kiosk: 'таблет в кухнята',
  tv: 'телевизор',
};

function nameOf(mode: DeviceMode): string {
  return DEVICE_CHOICES.find((choice) => choice.mode === mode)?.name ?? mode;
}

/**
 * Как се връща обратно днес: kiosk има зъбче към Настройки на дашборда; TV няма Настройки и се връща само през
 * `?device=` в адреса (root layout-ът го записва).
 */
function wayBack(from: DeviceMode, to: DeviceMode): ReactNode {
  if (to === 'kiosk') {
    return `Обратно: зъбчето долу вдясно на дашборда → Настройки → Устройство → ${nameOf(from)}.`;
  }
  return (
    <>
      Обратно: отвори адреса на приложението с{' '}
      <span className="settings__nowrap">„?device={from}“</span> в края.
    </>
  );
}

/** Лист „Телефонът ще стане телевизор…“ със „Смени“ и „Откажи“; фокусът е на „Откажи“. */
export function DeviceModeConfirm({
  from,
  to,
  onConfirm,
  onCancel,
}: {
  from: DeviceMode;
  to: DeviceMode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <Sheet title={nameOf(to)} onClose={onCancel} hideClose>
      <p className="settings__confirm-text">
        {SUBJECT[from]} ще стане {BECOMES[to]}: без навигация и без известия.
        Продължи?
      </p>
      <p className="settings__hint">{wayBack(from, to)}</p>
      <div className="settings__actions">
        <button type="button" className="button" onClick={onConfirm}>
          Смени
        </button>
        <button
          ref={cancelRef}
          type="button"
          className="button button--quiet"
          onClick={onCancel}
        >
          Откажи
        </button>
      </div>
    </Sheet>
  );
}
