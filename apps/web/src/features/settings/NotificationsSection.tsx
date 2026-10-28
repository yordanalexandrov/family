import type { NotificationKind, NotificationSettings } from '@family/shared';
import { useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { Toast } from '../../components/Toast';
import {
  type PushDevice,
  useDisablePush,
  useEnablePush,
  useNotificationSettings,
  usePushDevice,
  useSaveNotificationSettings,
  useSendTestNotification,
} from './push';

const KINDS: { kind: NotificationKind; label: string; description: string }[] =
  [
    {
      kind: 'thaw',
      label: 'Извади месото',
      description: 'Вечерта преди и сутринта за вечеря с продукт от фризера.',
    },
    {
      kind: 'cook',
      label: 'Кой готви довечера',
      description: 'В 16:00 до готвача или въпрос до двамата.',
    },
    {
      kind: 'menu',
      label: 'Съгласуване на менюто',
      description: 'Промени на другия по менюто и ново предложение.',
    },
  ];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Нещо се обърка';
}

/** „Известия“ в „Настройки“, само на телефона: абонамент на устройството и видовете за човека. */
export function NotificationsSection() {
  const device = usePushDevice();
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      {device.isPending ? (
        <Spinner />
      ) : device.isError ? (
        <ErrorBox error={device.error} onRetry={() => void device.refetch()} />
      ) : (
        <Device device={device.data} onMessage={setToast} />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Device({
  device,
  onMessage,
}: {
  device: PushDevice;
  onMessage: (message: string) => void;
}) {
  const enable = useEnablePush();
  const disable = useDisablePush();
  const sendTest = useSendTestNotification();

  switch (device.status) {
    case 'unsupported':
      return (
        <p className="settings__hint">
          Този браузър не поддържа известия. На Android ги има в инсталираното
          приложение от Chrome.
        </p>
      );
    case 'disabled':
      return (
        <p className="settings__hint">Известията не са включени на сървъра.</p>
      );
    case 'denied':
      return (
        <>
          <p className="settings__hint">
            Известията са забранени в браузъра. Разреши ги от настройките на
            Android: Настройки → Приложения → Семейство → Известия.
          </p>
          <Kinds onMessage={onMessage} />
        </>
      );
    case 'off':
      return (
        <>
          <p className="settings__hint">
            Това устройство не получава известия.
          </p>
          <div className="settings__actions">
            <button
              type="button"
              className="button"
              disabled={enable.isPending}
              onClick={() =>
                enable.mutate(device.publicKey, {
                  onError: (error) => onMessage(messageOf(error)),
                })
              }
            >
              Включи известия на това устройство
            </button>
          </div>
          <Kinds onMessage={onMessage} />
        </>
      );
    case 'on':
      return (
        <>
          <p className="settings__hint">Това устройство получава известия.</p>
          <div className="settings__actions">
            <button
              type="button"
              className="button"
              disabled={sendTest.isPending}
              onClick={() =>
                sendTest.mutate(undefined, {
                  onSuccess: (sent) =>
                    onMessage(
                      sent > 0
                        ? 'Пробното известие тръгна'
                        : 'Нито едно устройство не прие пробното известие',
                    ),
                  onError: (error) => onMessage(messageOf(error)),
                })
              }
            >
              Изпрати пробно
            </button>
            <button
              type="button"
              className="button button--quiet"
              disabled={disable.isPending}
              onClick={() =>
                disable.mutate(device.subscription, {
                  onError: (error) => onMessage(messageOf(error)),
                })
              }
            >
              Изключи на това устройство
            </button>
          </div>
          <Kinds onMessage={onMessage} />
        </>
      );
  }
}

/** Трите вида като превключватели: важат за човека на всичките му устройства. */
function Kinds({ onMessage }: { onMessage: (message: string) => void }) {
  const settings = useNotificationSettings();
  const save = useSaveNotificationSettings();

  if (settings.isPending) {
    return <Spinner />;
  }
  if (settings.isError) {
    return (
      <ErrorBox
        error={settings.error}
        onRetry={() => void settings.refetch()}
      />
    );
  }
  const toggle = (kind: NotificationKind, enabled: boolean) => {
    const next: NotificationSettings = { ...settings.data, [kind]: enabled };
    save.mutate(next, {
      onError: (error) => onMessage(messageOf(error)),
    });
  };

  return (
    <fieldset className="settings__choices">
      <legend className="visually-hidden">Видове известия</legend>
      {KINDS.map(({ kind, label, description }) => (
        <label key={kind} className="settings__choice settings__switch">
          <span className="settings__choice-text">
            <span className="settings__choice-label">{label}</span>
            <span className="settings__choice-description">{description}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={label}
            checked={settings.data[kind]}
            aria-checked={settings.data[kind]}
            onChange={(event) => toggle(kind, event.target.checked)}
          />
        </label>
      ))}
    </fieldset>
  );
}
