import { Link } from '@tanstack/react-router';
import { useMe } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import './HomeScreen.css';

export function HomeScreen() {
  const me = useMe();

  if (me.isPending) {
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
      <nav className="home__nav" aria-label="Екрани">
        <Link to="/recipes" className="button">
          Рецепти
        </Link>
      </nav>
      <Link to="/who" className="button button--quiet">
        Смени
      </Link>
    </main>
  );
}
