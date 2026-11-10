import { addDays, type DateKey, weekdayOf } from '@family/shared';
import { useState } from 'react';
import { useUsers } from '../../api/queries';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { usePlan, useThread } from '../menu/queries';
import { ThreadLine } from '../menu/Thread';
import { mealDayLabel, slotLabel } from './messages';
import '../menu/menu.css';

interface MealContextProps {
  mealId: string;
  /** Денят на ястието: по него е седмицата на плана и разговора. */
  date: DateKey;
  /** „Махни“: заявката отива без ястието. */
  onRemove: () => void;
}

/**
 * „Агентът ще вземе предвид“: ястието и разговорът му (GLOSSARY: Разговор), които API-то праща на `recipe.suggest`
 * като `meal`. Свито се виждат само коментарите на хората; „Целият разговор“ показва и системните редове, защото и тях
 * чете агентът.
 */
export function MealContext({ mealId, date, onRemove }: MealContextProps) {
  const weekStart = addDays(date, -weekdayOf(date));
  const plan = usePlan(weekStart);
  const thread = useThread(weekStart, mealId);
  const users = useUsers();
  const [expanded, setExpanded] = useState(false);

  const meal = plan.data?.meals.find((candidate) => candidate.id === mealId);
  const current = meal?.recipe?.title ?? meal?.note ?? undefined;
  const byId = new Map((users.data ?? []).map((user) => [user.id, user]));
  const lines = thread.data ?? [];
  const comments = lines.filter((line) => line.kind === 'comment');
  const systemCount = lines.length - comments.length;
  const shown = expanded ? lines : comments;

  return (
    <section className="meal-context" aria-labelledby="meal-context-title">
      <header className="meal-context__header">
        <h2 id="meal-context-title" className="meal-context__title">
          Агентът ще вземе предвид
        </h2>
        <button
          type="button"
          className="meal-context__remove"
          aria-label="Без коментарите по ястието"
          onClick={onRemove}
        >
          Махни
        </button>
      </header>
      <p className="meal-context__meal">
        {meal ? `${slotLabel(meal.slot)} · ` : ''}
        {mealDayLabel(date)}
        {current && (
          <>
            {' · сега: '}
            <span className="meal-context__current">{current}</span>
          </>
        )}
      </p>
      {thread.isPending ? (
        <Spinner />
      ) : thread.isError ? (
        <ErrorBox error={thread.error} onRetry={() => void thread.refetch()} />
      ) : (
        <>
          <ol className="thread__lines" aria-label="Разговор по ястието">
            {shown.map((line) => (
              <ThreadLine
                key={line.id}
                line={line}
                author={byId.get(line.authorUserId)}
              />
            ))}
            {shown.length === 0 && (
              <li className="thread__empty">Още няма коментари.</li>
            )}
          </ol>
          {systemCount > 0 && (
            <button
              type="button"
              className="meal-context__toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded
                ? 'Само коментарите'
                : `Целият разговор (+${systemCount})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
