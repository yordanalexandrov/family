import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUsers } from '../api/queries';
import { Avatar } from '../components/Avatar';
import { Toast } from '../components/Toast';
import { useActingUser } from './acting-user';
import { isPersonalDevice, useDeviceMode } from './device-mode';
import './ActingUserAvatar.css';

function useActingUserRecord() {
  const { actingUserId } = useActingUser();
  const users = useUsers();
  return users.data?.find((user) => user.id === actingUserId);
}

/**
 * Горе вдясно на основните екрани (A-10): на чие име се записва. Докосването отваря „Кой си?“.
 * Без действащ човек (kiosk, TV) го няма.
 */
export function ActingUserAvatar() {
  const { mode } = useDeviceMode();
  const user = useActingUserRecord();
  if (!isPersonalDevice(mode) || !user) {
    return null;
  }
  return (
    <Link
      to="/who"
      className="acting-user"
      aria-label={`Ти си ${user.name} · смени`}
    >
      <Avatar initial={user.initial} color={user.color} size="sm" />
    </Link>
  );
}

/** „Сега си Поли“ след смяна на действащия човек, на който и да е екран след „Кой си?“. */
export function ActingUserToast() {
  const { actingUserId } = useActingUser();
  const previous = useRef(actingUserId);
  const [switched, setSwitched] = useState(false);
  const user = useActingUserRecord();

  useEffect(() => {
    if (previous.current !== null && actingUserId !== null) {
      setSwitched(previous.current !== actingUserId);
    }
    previous.current = actingUserId;
  }, [actingUserId]);

  const done = useCallback(() => setSwitched(false), []);
  return (
    <Toast
      message={switched && user ? `Сега си ${user.name}` : null}
      onDone={done}
    />
  );
}
