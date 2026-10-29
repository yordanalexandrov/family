import { useEffect, useState } from 'react';
import { useInstallPrompt } from '../../app/install-prompt';
import { Spinner } from '../../components/Spinner';
import { Toast } from '../../components/Toast';
import { errorMessage } from '../../lib/error-message';
import { EnablePushButton } from '../settings/EnablePushButton';
import { dismissPushPrompt, usePushDevice } from '../settings/push';

/**
 * „Искаш ли напомняния?“ веднага след „Кой си?“ на телефона и в браузъра (A-03): същото включване като в Настройки.
 * Прескача се, ако известията не се поддържат, не са включени на сървъра, забранени са или устройството вече е абонирано.
 * „По-късно“ се помни на устройството.
 */
export function RemindersStep({ onDone }: { onDone: () => void }) {
  const device = usePushDevice();
  const [enabled, setEnabled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const skip =
    !enabled &&
    (device.isError || (device.isSuccess && device.data.status !== 'off'));

  useEffect(() => {
    if (skip) {
      onDone();
    }
  }, [skip, onDone]);

  if (device.isPending || skip) {
    return (
      <main className="screen who">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="screen who reminders">
      <h1 className="screen__title">Искаш ли напомняния?</h1>
      <p className="who__why">
        „Извади месото“, „Кой готви довечера“ и съгласуването на менюто идват
        като известия на този телефон.
      </p>
      {enabled ? (
        <>
          <p className="reminders__done" role="status">
            Известията са включени.
          </p>
          <div className="reminders__actions">
            <button type="button" className="button" onClick={onDone}>
              Към Дашборда
            </button>
          </div>
        </>
      ) : (
        device.data?.status === 'off' && (
          <div className="reminders__actions">
            <EnablePushButton
              publicKey={device.data.publicKey}
              label="Включи"
              onEnabled={() => setEnabled(true)}
              onError={(error) => setToast(errorMessage(error))}
            />
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                dismissPushPrompt();
                onDone();
              }}
            >
              По-късно
            </button>
          </div>
        )
      )}
      <InstallHint />
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
}

/** Неинсталирано приложение: на Android известията идват в инсталираното, затова и „Инсталирай“. */
function InstallHint() {
  const { standalone, accepted, install } = useInstallPrompt();

  if (standalone) {
    return null;
  }
  if (accepted) {
    return (
      <p className="reminders__install" role="status">
        Приложението е инсталирано.
      </p>
    );
  }
  return (
    <section className="reminders__install" aria-label="Инсталиране">
      <p>На Android известията идват в инсталираното приложение.</p>
      {install ? (
        <button
          type="button"
          className="button button--quiet"
          onClick={install}
        >
          Инсталирай
        </button>
      ) : (
        <p className="reminders__menu">
          Меню на браузъра → Инсталирай приложението
        </p>
      )}
    </section>
  );
}
