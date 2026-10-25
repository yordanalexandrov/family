import {
  addDays,
  type DateKey,
  hasWeekStarted,
  type MealPlan,
  menuProposalRequestSchema,
  type User,
  weekStartOf,
  weekStartSchema,
} from '@family/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useUsers } from '../../api/queries';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { formatDate } from '../../lib/format';
import { useNow } from '../dashboard/use-now';
import { failureMessage, requestErrorFor } from '../suggestions/messages';
import { MealRow } from './MealRow';
import { MealSheet } from './MealSheet';
import {
  notEnoughRecipes,
  useCreatePlan,
  useDeletePlan,
  useMenuProposal,
  usePlan,
  useProposeMenu,
} from './queries';
import '../recipes/recipes.css';
import './menu.css';

const HINT_MAX = 200;

/** `?week=` (понеделник) и `?proposal=` (предложението, което се чака) на `/menu`. */
export interface MenuSearch {
  week?: DateKey;
  proposal?: string;
}

export function parseMenuSearch(search: Record<string, unknown>): MenuSearch {
  const week = weekStartSchema.safeParse(search.week);
  const proposal = menuProposalRequestSchema.shape.id.safeParse(
    search.proposal,
  );
  return {
    ...(week.success ? { week: week.data } : {}),
    ...(proposal.success ? { proposal: proposal.data } : {}),
  };
}

/**
 * `/menu`: тази или следващата седмица, назад към минали (само за четене). Седмица без план предлага меню
 * или празен план; план е 7 вечери, всяка се редактира в лист.
 */
export function MenuWeek() {
  const now = useNow(60_000);
  const thisWeek = weekStartOf(now);
  const nextWeek = addDays(thisWeek, 7);
  const search = useSearch({ from: '/menu' });
  const navigate = useNavigate({ from: '/menu' });
  const weekStart = search.week ?? thisWeek;
  const isPast = weekStart < thisWeek;

  const setProposal = useCallback(
    (proposal: string | undefined) =>
      void navigate({
        search: ({ proposal: _, ...rest }) =>
          proposal ? { ...rest, proposal } : rest,
        replace: true,
      }),
    [navigate],
  );

  function showWeek(week: DateKey) {
    void navigate({ search: week === thisWeek ? {} : { week } });
  }

  return (
    <main className="screen recipes menu">
      <header className="recipes__header">
        <h1 className="recipes__title">Меню</h1>
      </header>
      <nav className="menu__weeks" aria-label="Седмица">
        <button
          type="button"
          className="menu__back"
          aria-label="Предишна седмица"
          onClick={() => showWeek(addDays(weekStart, -7))}
        >
          ←
        </button>
        <div className="menu__tabs" role="tablist">
          {(
            [
              [thisWeek, 'Тази седмица'],
              [nextWeek, 'Следваща седмица'],
            ] as const
          ).map(([week, label]) => (
            <button
              key={week}
              type="button"
              role="tab"
              className="menu__tab"
              aria-selected={weekStart === week}
              onClick={() => showWeek(week)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <p className="menu__range">
        {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
        {isPast && <span className="badge">минала седмица</span>}
      </p>
      <Week
        key={weekStart}
        weekStart={weekStart}
        readOnly={isPast}
        canDelete={!hasWeekStarted(weekStart, now)}
        proposalId={search.proposal}
        onProposal={setProposal}
      />
    </main>
  );
}

interface WeekProps {
  weekStart: DateKey;
  readOnly: boolean;
  canDelete: boolean;
  proposalId: string | undefined;
  onProposal: (id: string | undefined) => void;
}

function Week({
  weekStart,
  readOnly,
  canDelete,
  proposalId,
  onProposal,
}: WeekProps) {
  const plan = usePlan(weekStart);
  const users = useUsers();
  const proposal = useMenuProposal(proposalId);
  const done = proposal.data?.status === 'done';
  useEffect(() => {
    if (done) {
      onProposal(undefined);
    }
  }, [done, onProposal]);

  if (proposalId !== undefined && !done) {
    if (proposal.isError) {
      return (
        <ErrorBox
          error={proposal.error}
          onRetry={() => void proposal.refetch()}
        />
      );
    }
    if (proposal.data?.status === 'failed') {
      return (
        <ProposeForm
          weekStart={weekStart}
          failure={failureMessage(proposal.data.error)}
          initialHint={proposal.data.hint ?? ''}
          onProposal={onProposal}
        />
      );
    }
    return (
      <div className="menu__waiting">
        <Spinner label="Изчакване…" />
        <p>Съставям меню…</p>
      </div>
    );
  }
  if (plan.isPending || users.isPending) {
    return <Spinner />;
  }
  if (plan.isError || users.isError) {
    return (
      <ErrorBox
        error={plan.error ?? users.error}
        onRetry={() => {
          void plan.refetch();
          void users.refetch();
        }}
      />
    );
  }
  if (plan.data === null) {
    return readOnly ? (
      <p className="recipes__empty">Няма меню за тази седмица.</p>
    ) : (
      <ProposeForm weekStart={weekStart} onProposal={onProposal} />
    );
  }
  return (
    <PlanView
      plan={plan.data}
      users={users.data}
      readOnly={readOnly}
      canDelete={canDelete}
    />
  );
}

interface ProposeFormProps {
  weekStart: DateKey;
  onProposal: (id: string | undefined) => void;
  /** Съобщението на неуспешното предложение; тогава бутонът е „Опитай пак“. */
  failure?: string;
  initialHint?: string;
}

/** Седмица без план: „Предложи меню“ с подсказка или „Започни празно“. */
function ProposeForm({
  weekStart,
  onProposal,
  failure,
  initialHint = '',
}: ProposeFormProps) {
  const [hint, setHint] = useState(initialHint);
  const propose = useProposeMenu();
  const createPlan = useCreatePlan();
  const missing = notEnoughRecipes(propose.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = hint.trim();
    propose.mutate(
      { weekStart, ...(trimmed ? { hint: trimmed } : {}) },
      { onSuccess: (proposal) => onProposal(proposal.id) },
    );
  }

  return (
    <form className="menu__propose" noValidate onSubmit={submit}>
      {failure && (
        <p className="error-box__message" role="alert">
          {failure}
        </p>
      )}
      <div className="field">
        <label className="field__label" htmlFor="menu-hint">
          Подсказка
        </label>
        <input
          id="menu-hint"
          className="field__input"
          maxLength={HINT_MAX}
          placeholder="напр. повече риба, в петък пица"
          value={hint}
          onChange={(event) => setHint(event.target.value)}
        />
        <span className="menu__counter">
          {hint.length}/{HINT_MAX}
        </span>
      </div>
      {missing ? (
        <p className="menu__missing" role="alert">
          Добавете още {missing.need - missing.have} рецепти за вечеря.{' '}
          <Link to="/recipes/suggest">Поискай предложения</Link>
        </p>
      ) : (
        propose.isError && <ErrorBox error={requestErrorFor(propose.error)} />
      )}
      {createPlan.isError && <ErrorBox error={createPlan.error} />}
      <div className="recipes__actions">
        <button type="submit" className="button" disabled={propose.isPending}>
          {failure ? 'Опитай пак' : 'Предложи меню'}
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={createPlan.isPending}
          onClick={() =>
            createPlan.mutate(weekStart, {
              onSuccess: () => onProposal(undefined),
            })
          }
        >
          Започни празно
        </button>
      </div>
    </form>
  );
}

interface PlanViewProps {
  plan: MealPlan;
  users: User[];
  readOnly: boolean;
  canDelete: boolean;
}

function PlanView({ plan, users, readOnly, canDelete }: PlanViewProps) {
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const openMeal = plan.meals.find((meal) => meal.id === openMealId);
  return (
    <>
      <ol className="menu__meals" aria-label="Вечери">
        {plan.meals.map((meal) => (
          <li key={meal.id}>
            <MealRow
              meal={meal}
              users={users}
              {...(readOnly ? {} : { onOpen: () => setOpenMealId(meal.id) })}
            />
          </li>
        ))}
      </ol>
      {plan.summary && <p className="menu__summary">{plan.summary}</p>}
      {!readOnly && canDelete && <DeletePlan plan={plan} />}
      {openMeal && (
        <MealSheet
          meal={openMeal}
          plan={plan}
          users={users}
          onClose={() => setOpenMealId(null)}
        />
      )}
    </>
  );
}

/** „Изтрий плана“ с потвърждение; само докато седмицата не е започнала. */
function DeletePlan({ plan }: { plan: MealPlan }) {
  const [confirming, setConfirming] = useState(false);
  const deletePlan = useDeletePlan();
  if (!confirming) {
    return (
      <button
        type="button"
        className="button button--quiet menu__delete"
        onClick={() => setConfirming(true)}
      >
        Изтрий плана
      </button>
    );
  }
  return (
    <div className="menu__confirm" role="alertdialog" aria-label="Изтриване">
      <p>Да изтрия ли менюто за тази седмица?</p>
      {deletePlan.isError && <ErrorBox error={deletePlan.error} />}
      <div className="recipes__actions">
        <button
          type="button"
          className="button menu__danger"
          disabled={deletePlan.isPending}
          onClick={() => deletePlan.mutate(plan)}
        >
          Изтрий
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setConfirming(false)}
        >
          Откажи
        </button>
      </div>
    </div>
  );
}
