import {
  addDays,
  type DateKey,
  dateKeyInSofia,
  HINT_MAX,
  hasWeekStarted,
  isAgreed,
  isPastMeal,
  type MealOutcome,
  type MealPlan,
  mealOutcome,
  menuProposalRequestSchema,
  type Rating,
  type User,
  weekStartOf,
  weekStartSchema,
} from '@family/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useUsers } from '../../api/queries';
import { useActingUser } from '../../app/acting-user';
import { useDeviceMode } from '../../app/device-mode';
import { BackLink } from '../../components/BackLink';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { failureMessage, requestErrorFor } from '../../lib/ai-requests';
import { formatDate } from '../../lib/format';
import { useNow } from '../../lib/use-now';
import { useRateRecipe } from '../recipes/queries';
import { DraggableMeal, MealDrag } from './MealDrag';
import { MealRow } from './MealRow';
import { MealSheet } from './MealSheet';
import {
  notEnoughRecipes,
  useCreatePlan,
  useDeletePlan,
  useMenuProposal,
  usePlan,
  useProposeMenu,
  useVote,
  useWeekProposal,
} from './queries';
import { OUTCOME_LABELS } from './Votes';
import '../recipes/recipes.css';
import './menu.css';

/** `?week=` (понеделник) и `?proposal=` (предложението, което се чака) на `/menu`. */
export interface MenuSearch {
  week?: DateKey;
  proposal?: string;
}

/**
 * Невалидният параметър става изрично `undefined`: router-ът слива резултата върху суровия search на root route-а,
 * така че изпуснат ключ би оставил суровата стойност.
 */
export function parseMenuSearch(search: Record<string, unknown>): MenuSearch {
  const week = weekStartSchema.safeParse(search.week);
  const proposal = menuProposalRequestSchema.shape.id.safeParse(
    search.proposal,
  );
  return {
    week: week.success ? week.data : undefined,
    proposal: proposal.success ? proposal.data : undefined,
  };
}

/**
 * `/menu`: тази или следващата седмица, назад към минали (само за четене); на kiosk всичко е само за четене.
 * Седмица без план предлага меню или празен план; план е 7 вечери, всяка се редактира в лист.
 */
export function MenuWeek() {
  const now = useNow(60_000);
  const thisWeek = weekStartOf(now);
  const nextWeek = addDays(thisWeek, 7);
  const search = useSearch({ from: '/menu' });
  const navigate = useNavigate({ from: '/menu' });
  const weekStart = search.week ?? thisWeek;
  // Менюто се променя само с действащ потребител (телефон); kiosk го отваря от дашборда за четене.
  const { mode } = useDeviceMode();
  const canEdit = mode === 'phone';
  const isPast = weekStart < thisWeek;
  // Гласове има само в телефонния изглед, с действащ потребител.
  const { actingUserId } = useActingUser();

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
        {!canEdit && <BackLink />}
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
        readOnly={isPast || !canEdit}
        canDelete={!hasWeekStarted(weekStart, now)}
        voterId={canEdit ? actingUserId : null}
        today={dateKeyInSofia(now)}
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
  voterId: string | null;
  today: DateKey;
  proposalId: string | undefined;
  onProposal: (id: string | undefined) => void;
}

function Week({
  weekStart,
  readOnly,
  canDelete,
  voterId,
  today,
  proposalId,
  onProposal,
}: WeekProps) {
  const plan = usePlan(weekStart);
  const users = useUsers();
  const proposal = useMenuProposal(proposalId);
  // Седмица без план може да чака или да е изпуснала предложението на крона (сряда 09:00).
  const weekProposal = useWeekProposal(
    weekStart,
    plan.data === null && proposalId === undefined,
  );
  const scheduled =
    weekProposal.data?.trigger === 'schedule' ? weekProposal.data : null;
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
    return <Waiting />;
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
    if (weekProposal.isPending) {
      return <Spinner />;
    }
    if (scheduled?.status === 'pending') {
      return <Waiting scheduled />;
    }
    if (readOnly) {
      return <p className="recipes__empty">Няма меню за тази седмица.</p>;
    }
    return scheduled?.status === 'failed' ? (
      <ProposeForm
        weekStart={weekStart}
        onProposal={onProposal}
        failure={failureMessage(scheduled.error)}
        scheduled
      />
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
      voterId={voterId}
      today={today}
    />
  );
}

/** Предложението на крона: в сряда 09:00 за следващата седмица, без подсказка и без потребител. */
const SCHEDULED = 'Предложено автоматично в сряда';

function ScheduledNote() {
  return (
    <p className="menu__scheduled">
      <span className="badge">{SCHEDULED}</span>
    </p>
  );
}

/** Заявката за меню още е `pending`. */
function Waiting({ scheduled = false }: { scheduled?: boolean }) {
  return (
    <div className="menu__waiting">
      {scheduled && <ScheduledNote />}
      <Spinner label="Изчакване…" />
      <p>Съставям меню…</p>
    </div>
  );
}

interface ProposeFormProps {
  weekStart: DateKey;
  onProposal: (id: string | undefined) => void;
  /** Съобщението на неуспешното предложение; тогава бутонът е „Опитай пак“, освен ако го е пуснал кронът. */
  failure?: string;
  initialHint?: string;
  /** Неуспешното предложение е на крона: никой още не е пробвал, затова бутонът остава „Предложи меню“. */
  scheduled?: boolean;
}

/** Седмица без план: „Предложи меню“ с подсказка или „Започни празно“. */
function ProposeForm({
  weekStart,
  onProposal,
  failure,
  initialHint = '',
  scheduled = false,
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
      {scheduled && <ScheduledNote />}
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
          {failure && !scheduled ? 'Опитай пак' : 'Предложи меню'}
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
  /** Действащият потребител, който гласува; `null` без гласове (kiosk). */
  voterId: string | null;
  today: DateKey;
}

/** Филтрите по изход на ястие; „Остава“ няма свой, защото е целта. */
const FILTERS = [
  'discuss',
  'replace',
  'pending',
] as const satisfies readonly MealOutcome[];

type Filter = (typeof FILTERS)[number] | 'all';

function PlanView({
  plan,
  users,
  readOnly,
  canDelete,
  voterId,
  today,
}: PlanViewProps) {
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const vote = useVote(plan.weekStart);
  const rate = useRateRecipe();
  const openMeal = plan.meals.find((meal) => meal.id === openMealId);
  const userIds = users.map((user) => user.id);
  const outcomeOf = (meal: MealPlan['meals'][number]) =>
    mealOutcome(meal.votes, userIds);
  const coming = plan.meals.filter((meal) => !isPastMeal(meal, today));
  // Съгласуване има, докато в седмицата има ден от днес нататък.
  const agreement = voterId !== null && coming.length > 0;
  const agreed = agreement && isAgreed(plan.meals, userIds, today);
  const meals =
    filter === 'all'
      ? plan.meals
      : coming.filter((meal) => outcomeOf(meal) === filter);
  const voting = voterId
    ? {
        userId: voterId,
        today,
        onVote: (
          meal: MealPlan['meals'][number],
          value: 'up' | 'down' | null,
        ) => vote.mutate({ meal, userId: voterId, value }),
        onRate: (id: string, rating: Rating | null) =>
          rate.mutate({ id, rating }),
      }
    : undefined;

  return (
    <>
      {plan.createdBy === null && <ScheduledNote />}
      {agreed && (
        <p className="menu__agreed" role="status">
          <span aria-hidden="true">✓ </span>Менюто е съгласувано
        </p>
      )}
      {agreement && !agreed && (
        <div className="menu__filters" role="tablist" aria-label="Филтър">
          {(['all', ...FILTERS] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className="chip menu__filter"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? (
                'Всички'
              ) : (
                <>
                  {OUTCOME_LABELS[key]}{' '}
                  <span className="menu__filter-count">
                    {coming.filter((meal) => outcomeOf(meal) === key).length}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      {vote.isError && <ErrorBox error={vote.error} />}
      {rate.isError && <ErrorBox error={rate.error} />}
      {voting && !readOnly ? (
        <MealDrag plan={plan}>
          <ol className="menu__meals" aria-label="Вечери">
            {meals.map((meal) => (
              <DraggableMeal key={meal.id} meal={meal} today={today}>
                {(handle) => (
                  <MealRow
                    meal={meal}
                    users={users}
                    onOpen={() => setOpenMealId(meal.id)}
                    voting={voting}
                    handle={handle}
                  />
                )}
              </DraggableMeal>
            ))}
          </ol>
        </MealDrag>
      ) : (
        <ol className="menu__meals" aria-label="Вечери">
          {meals.map((meal) => (
            <li key={meal.id}>
              <MealRow
                meal={meal}
                users={users}
                {...(readOnly && !voting
                  ? {}
                  : { onOpen: () => setOpenMealId(meal.id) })}
                {...(voting ? { voting } : {})}
              />
            </li>
          ))}
        </ol>
      )}
      {meals.length === 0 && (
        <p className="recipes__empty">Няма такива ястия.</p>
      )}
      {plan.summary && <p className="menu__summary">{plan.summary}</p>}
      {!readOnly && canDelete && <DeletePlan plan={plan} />}
      {openMeal && (
        <MealSheet
          meal={openMeal}
          plan={plan}
          users={users}
          today={today}
          readOnly={readOnly}
          {...(voting ? { onVote: voting.onVote, voterId: voting.userId } : {})}
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
      <p>
        Да изтрия ли менюто за тази седмица? Гласовете и разговорите се трият
        заедно с менюто.
      </p>
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
