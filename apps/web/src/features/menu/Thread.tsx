import {
  type DateKey,
  dateKeyInSofia,
  MEAL_COMMENT_MAX,
  type Meal,
  type MealComment,
  type User,
} from '@family/shared';
import { type FormEvent, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatTime, formatWeekday } from '../../lib/format';
import { useAddComment, useDeleteComment, useThread } from './queries';

interface ThreadProps {
  meal: Meal;
  weekStart: DateKey;
  users: User[];
  /** Действащият потребител: пише и трие свои коментари. */
  userId: string;
  /** Минал ден: разговорът се чете, но не се пише. */
  readOnly: boolean;
}

/**
 * Разговорът на ястието (GLOSSARY: Разговор): коментарите с аватар и час, системните редове приглушени, с името на
 * сменилия отпред. Свой коментар се трие; на минал ден няма поле и „Изтрий“.
 */
export function Thread({
  meal,
  weekStart,
  users,
  userId,
  readOnly,
}: ThreadProps) {
  const thread = useThread(weekStart, meal.id);
  const remove = useDeleteComment(weekStart, meal.id);
  const byId = new Map(users.map((user) => [user.id, user]));

  return (
    <section className="sheet__section thread" aria-labelledby="thread-title">
      <h3 id="thread-title" className="field__label">
        Разговор
      </h3>
      {remove.isError && <ErrorBox error={remove.error} />}
      {thread.isPending ? (
        <Spinner />
      ) : thread.isError ? (
        <ErrorBox error={thread.error} onRetry={() => void thread.refetch()} />
      ) : (
        <ol className="thread__lines" aria-label="Разговор">
          {thread.data.map((line) => (
            <ThreadLine
              key={line.id}
              line={line}
              author={byId.get(line.authorUserId)}
              {...(!readOnly &&
              line.kind === 'comment' &&
              line.authorUserId === userId
                ? { onDelete: () => remove.mutate(line.id) }
                : {})}
            />
          ))}
          {thread.data.length === 0 && (
            <li className="thread__empty">Още няма коментари.</li>
          )}
        </ol>
      )}
      {!readOnly && <CommentField meal={meal} weekStart={weekStart} />}
    </section>
  );
}

function ThreadLine({
  line,
  author,
  onDelete,
}: {
  line: MealComment;
  author: User | undefined;
  onDelete?: () => void;
}) {
  const name = author?.name ?? 'Някой';
  const when = (
    <time className="thread__time" dateTime={line.createdAt}>
      {formatWeekday(dateKeyInSofia(new Date(line.createdAt)))}{' '}
      {formatTime(line.createdAt)}
    </time>
  );
  if (line.kind === 'system') {
    return (
      <li className="thread__line thread__line--system">
        <span>
          {name} {line.body}
        </span>{' '}
        {when}
      </li>
    );
  }
  return (
    <li className="thread__line">
      {author && (
        <Avatar initial={author.initial} color={author.color} size="sm" />
      )}
      <div className="thread__bubble">
        <div className="thread__meta">
          <span className="thread__author">{name}</span> {when}
        </div>
        <p className="thread__body">{line.body}</p>
      </div>
      {onDelete && (
        <button
          type="button"
          className="thread__delete"
          aria-label="Изтрий коментара"
          title="Изтрий"
          onClick={onDelete}
        >
          ×
        </button>
      )}
    </li>
  );
}

function CommentField({ meal, weekStart }: { meal: Meal; weekStart: DateKey }) {
  const [body, setBody] = useState('');
  const add = useAddComment(weekStart, meal.id);

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(body, { onSuccess: () => setBody('') });
  }

  return (
    <form className="thread__form" noValidate onSubmit={submit}>
      {add.isError && <ErrorBox error={add.error} />}
      <div className="sheet__row">
        <input
          className="field__input"
          aria-label="Коментар"
          placeholder="напр. пак пиле?"
          maxLength={MEAL_COMMENT_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button
          type="submit"
          className="button"
          disabled={body.trim() === '' || add.isPending}
        >
          Изпрати
        </button>
      </div>
    </form>
  );
}
