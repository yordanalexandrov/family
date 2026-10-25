import { useNavigate } from '@tanstack/react-router';
import { useUsers } from '../../api/queries';
import { useActingUser } from '../../app/acting-user';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import './WhoScreen.css';

export function WhoScreen() {
  const users = useUsers();
  const navigate = useNavigate();
  const { setActingUserId } = useActingUser();

  function choose(id: string) {
    setActingUserId(id);
    void navigate({ to: '/' });
  }

  return (
    <main className="screen who">
      <h1 className="screen__title">Кой си?</h1>
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
