import {
  classifyRework,
  type DateKey,
  HINT_MAX,
  type MealPlan,
  type ReworkDay,
  reworkCounts,
  type User,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { refusalOf } from '../../api/client';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { capitalize, formatShortDate, formatWeekday } from '../../lib/format';
import { useRequestRework, useRework } from './reworks';
import './ReworkSheet.css';

type PlanMeal = MealPlan['meals'][number];

interface ReworkSheetProps {
  plan: MealPlan;
  users: User[];
  today: DateKey;
  /** Преработката, която листът чака: пусната при предишно отваряне и още неприключила. */
  reworkId: string | undefined;
  /** Листът пусна преработка („Преработи“ или „Опитай пак“). */
  onRequested: (reworkId: string) => void;
  /** Преработката е записана в менюто: листът се затваря. */
  onDone: () => void;
  onClose: () => void;
}

/** „против от Поли“, „против от Дани и Поли“, „без гласове“, „празно“. */
function reasonText(day: ReworkDay<PlanMeal>, users: User[]): string {
  if (day.reason === 'vetoed') {
    const names = day.meal.votes
      .filter((vote) => vote.value === 'down')
      .map(
        (vote) => users.find((user) => user.id === vote.userId)?.name ?? '?',
      );
    return `против от ${names.join(' и ')}`;
  }
  return day.reason === 'unvoted' ? 'без гласове' : 'празно';
}

/** „Чт 5.11 · Мусака — против от Поли“; празен ден е само „Нд 8.11 · празно“. */
function dayText(day: ReworkDay<PlanMeal>, users: User[]): string {
  const when = `${capitalize(formatWeekday(day.meal.date))} ${formatShortDate(day.meal.date)}`;
  const what = day.meal.recipe?.title ?? day.meal.note;
  const reason = reasonText(day, users);
  return what ? `${when} · ${what} — ${reason}` : `${when} · ${reason}`;
}

/**
 * „✨ Преработи менюто“ (GLOSSARY: Преработка на менюто): подсказка до 200 знака, „Остават N · сменят се M · попълват
 * се K“ и сменяните и попълваните дни с причината, по `classifyRework` като в api. „Преработи“ пуска заявката и листът
 * чака („AI преработва менюто…“; може да се затвори и отвори пак), а при успех се затваря върху новото меню. Неуспехът
 * на AI показва причината и „Опитай пак“ със същата подсказка; `not_enough_recipes` казва колко рецепти липсват.
 */
export function ReworkSheet({
  plan,
  users,
  today,
  reworkId,
  onRequested,
  onDone,
  onClose,
}: ReworkSheetProps) {
  const start = useRequestRework();
  const request = useRework(reworkId);
  const current = request.data;
  const failed = current?.status === 'failed' ? current : undefined;
  const [hint, setHint] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  const days = classifyRework(plan.meals, today);
  const counts = reworkCounts(days);
  const changing = days.filter((day) => day.status === 'fill');
  // Пусната и още без отговор (или без първото четене, освен ако то е паднало).
  const waiting =
    start.isPending ||
    (reworkId !== undefined &&
      (current === undefined
        ? !request.isError
        : current.status === 'pending'));
  const missing = refusalOf(start.error, 'not_enough_recipes');

  // Неуспешната пуска наново същата подсказка.
  const failedId = failed?.id;
  const failedHint = failed?.hint;
  useEffect(() => {
    if (failedId !== undefined) {
      setHint(failedHint ?? '');
    }
  }, [failedId, failedHint]);

  const done = current?.status === 'done';
  useEffect(() => {
    if (done) {
      onDone();
    }
  }, [done, onDone]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (waiting) {
      return;
    }
    const trimmed = hint.trim();
    start.mutate(
      { weekStart: plan.weekStart, ...(trimmed ? { hint: trimmed } : {}) },
      { onSuccess: (created) => onRequested(created.id) },
    );
  };

  return (
    <Sheet
      title="Преработи менюто"
      onClose={onClose}
      closeLabel="Затвори"
      focusRef={fieldRef}
    >
      <form className="sheet__section rework" noValidate onSubmit={submit}>
        <Field label="Подсказка">
          {(props) => (
            <input
              {...props}
              ref={fieldRef}
              className="field__input"
              maxLength={HINT_MAX}
              placeholder="напр. по-леко, повече бобови"
              value={waiting ? (current?.hint ?? hint) : hint}
              disabled={waiting}
              onChange={(event) => setHint(event.target.value)}
            />
          )}
        </Field>
        <span className="menu__counter">
          {hint.length}/{HINT_MAX}
        </span>
        <p className="rework__counts">
          Остават {counts.keep} · сменят се {counts.replace} · попълват се{' '}
          {counts.fill}
        </p>
        <ul className="rework__days" aria-label="Какво се сменя">
          {changing.map((day) => (
            <li key={day.meal.id}>{dayText(day, users)}</li>
          ))}
        </ul>
        {waiting && (
          <div className="rework__waiting">
            <Spinner label="Изчакване…" />
            <p>AI преработва менюто…</p>
          </div>
        )}
        {failed && (
          <p className="error-box__message" role="alert">
            {failureMessage('rework', failed)}
          </p>
        )}
        {request.isError && (
          <ErrorBox
            error={request.error}
            onRetry={() => void request.refetch()}
          />
        )}
        {missing ? (
          <p className="menu__missing" role="alert">
            Трябват още {missing.need - missing.have} вечерни рецепти.{' '}
            <Link to="/recipes/suggest">Поискай предложения</Link>
          </p>
        ) : (
          start.isError && <ErrorBox error={start.error} />
        )}
        <div className="recipes__actions">
          <button type="submit" className="button" disabled={waiting}>
            {failed ? 'Опитай пак' : 'Преработи'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
