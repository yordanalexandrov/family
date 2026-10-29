import { APPLIANCE_NAME_MAX, type Appliance } from '@family/shared';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { Toast } from '../../components/Toast';
import { errorMessage } from '../../lib/error-message';
import {
  useAddAppliance,
  useAppliances,
  useRemoveAppliance,
  useSwitchAppliance,
} from '../appliances/queries';

interface Notice {
  message: string;
  /** Махнатият уред, който „Върни“ добавя отново. */
  removed?: Appliance;
}

/**
 * „Уреди“ в „Настройки“ (GLOSSARY: Уред): уредите на домакинството, общи за двамата. Включените стигат до
 * „Поискай предложения“; махането се връща с „Върни“ в toast-а.
 */
export function AppliancesSection() {
  const appliances = useAppliances();
  const switchAppliance = useSwitchAppliance();
  const addAppliance = useAddAppliance();
  const removeAppliance = useRemoveAppliance();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const onError = (error: unknown) =>
    setNotice({ message: errorMessage(error) });

  function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    addAppliance.mutate(
      { name: trimmed },
      { onSuccess: () => setName(''), onError },
    );
  }

  function remove(appliance: Appliance) {
    removeAppliance.mutate(appliance, {
      onSuccess: () =>
        setNotice({ message: `Махнах ${appliance.name}`, removed: appliance }),
      onError,
    });
  }

  const removed = notice?.removed;

  return (
    <>
      {appliances.isPending ? (
        <Spinner />
      ) : appliances.isError ? (
        <ErrorBox
          error={appliances.error}
          onRetry={() => void appliances.refetch()}
        />
      ) : (
        <ul className="settings__choices settings__appliances">
          {appliances.data.map((appliance) => (
            <li key={appliance.id} className="settings__appliance">
              <label className="settings__choice settings__switch">
                <span className="settings__choice-text">
                  <span className="settings__choice-label">
                    {appliance.name}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={appliance.name}
                  checked={appliance.enabled}
                  aria-checked={appliance.enabled}
                  onChange={(event) =>
                    switchAppliance.mutate(
                      { id: appliance.id, enabled: event.target.checked },
                      { onError },
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="button button--quiet settings__appliance-remove"
                aria-label={`Махни ${appliance.name}`}
                onClick={() => remove(appliance)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="settings__appliance-add" noValidate onSubmit={add}>
        <label className="visually-hidden" htmlFor="appliance-name">
          Нов уред
        </label>
        <input
          id="appliance-name"
          className="field__input"
          maxLength={APPLIANCE_NAME_MAX}
          placeholder="напр. хлебопекарна"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className="button"
          disabled={!name.trim() || addAppliance.isPending}
        >
          Добави уред
        </button>
      </form>

      <p className="settings__hint">
        Включените уреди са предпочитание за „Поискай предложения“. Важат за
        цялото домакинство.
      </p>

      <Toast
        message={notice?.message ?? null}
        onDone={() => setNotice(null)}
        undo={
          removed
            ? () =>
                addAppliance.mutate(
                  { name: removed.name, enabled: removed.enabled },
                  { onError },
                )
            : undefined
        }
      />
    </>
  );
}
