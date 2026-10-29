import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useUsers } from '../../api/queries';
import { useActingUser } from '../../app/acting-user';
import { isPersonalDevice, useDeviceMode } from '../../app/device-mode';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { readPushPromptDismissed } from '../settings/push';
import { RemindersStep } from './RemindersStep';
import './WhoScreen.css';

/**
 * „Кой си?“: избор на действащ потребител. На телефона и в браузъра след избора идва „Искаш ли напомняния?“, докато човекът не
 * каже „По-късно“ на това устройство.
 */
export function WhoScreen() {
  const users = useUsers();
  const navigate = useNavigate();
  const { setActingUserId } = useActingUser();
  const { mode } = useDeviceMode();
  const [askReminders, setAskReminders] = useState(false);

  const toDashboard = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);

  function choose(id: string) {
    setActingUserId(id);
    if (isPersonalDevice(mode) && !readPushPromptDismissed()) {
      setAskReminders(true);
    } else {
      toDashboard();
    }
  }

  if (askReminders) {
    return <RemindersStep onDone={toDashboard} />;
  }

  return (
    <main className="screen who">
      <h1 className="screen__title">Кой си?</h1>
      <p className="who__why">
        Отметките и гласовете се записват на твое име. Смени по всяко време от
        Настройки.
      </p>
      {users.isPending ? (
        <Spinner />
      ) : users.isError ? (
        <ErrorBox error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <ul className="who__list">
          {users.data.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="who__user"
                onClick={() => choose(user.id)}
              >
                <Avatar initial={user.initial} color={user.color} size="lg" />
                <span className="who__name">{user.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
