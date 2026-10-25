import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ApiError } from '../../api/client';
import { useMe } from '../../api/queries';
import { useActingUser } from '../../app/acting-user';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import './HomeScreen.css';

/** Потребителят е изтрит от api → изборът на устройството е невалиден. */
function isUnknownActingUser(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'unknown_acting_user';
}

export function HomeScreen() {
  const me = useMe();
  const { clearActingUser } = useActingUser();
  const unknownActingUser = isUnknownActingUser(me.error);

  // Чистим избора; root layout-ът вижда липсата му и води към „Кой си?“.
  useEffect(() => {
    if (unknownActingUser) {
      clearActingUser();
    }
  }, [unknownActingUser, clearActingUser]);

  if (me.isPending || unknownActingUser) {
    return (
      <main className="screen home">
        <Spinner />
      </main>
    );
  }

  if (me.isError) {
    return (
      <main className="screen home">
        <ErrorBox error={me.error} onRetry={() => void me.refetch()} />
      </main>
    );
  }

  const { user } = me.data;
  return (
    <main className="screen home">
      <Avatar initial={user.initial} color={user.color} size="lg" />
      <h1 className="screen__title">Здравей, {user.name}</h1>
      <Link to="/who" className="button">
        Смени
      </Link>
    </main>
  );
}
