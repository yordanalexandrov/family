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
  type MenuProposalRequest,
  mealOutcome,
  mealSchema,
  menuProposalRequestSchema,
  type Rating,
  type User,
  weekStartOf,
  weekStartSchema,
  withHint,
} from '@family/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { refusalOf } from '../../api/client';
import { useUsers } from '../../api/queries';
import { useActingUser } from '../../app/acting-user';
import { isPersonalDevice, useDeviceMode } from '../../app/device-mode';
import { ScreenHeader } from '../../app/ScreenHeader';
import { BackLink } from '../../components/BackLink';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { failureMessage, requestErrorFor } from '../../lib/ai-requests';
import { capitalize, formatDate, formatWeekday } from '../../lib/format';
import { useNow } from '../../lib/use-now';
import { useRateRecipe } from '../recipes/queries';
import { useShoppingWeek } from '../shopping/queries';
import { DraggableMeal, MealDrag } from './MealDrag';
import { MealRow, mealRowId } from './MealRow';
import { MealSheet, type RemovedRecipe, RemovedRecipeToast } from './MealSheet';
import {
  useCreatePlan,
  useDeletePlan,
  useMenuProposal,
  usePlan,
  useProposeMenu,
  useVote,
  useWeekProposal,
} from './queries';
import { useSeeWeek } from './unseen-proposals';
import { OUTCOME_LABELS } from './Votes';
import '../recipes/recipes.css';
import './menu.css';

/**
 * `?week=` (понеделник), `?proposal=` (предложението, което се чака) и `?meal=` (ястието, чийто лист да се отвори,
 * напр. от известие) на `/menu`.
 */
export interface MenuSearch {
  week?: DateKey;
  proposal?: string;
  meal?: string;
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
  const meal = mealSchema.shape.id.safeParse(search.meal);
  return {
    week: week.success ? week.data : undefined,
    proposal: proposal.success ? proposal.data : undefined,
    meal: meal.success ? meal.data : undefined,
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
  useSeeWeek(weekStart);
  // Менюто се променя само с действащ потребител (телефон); kiosk го отваря от дашборда за четене.
  const { mode } = useDeviceMode();
  const canEdit = isPersonalDevice(mode);
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

  // Отвореният лист е в state, не в адреса: листът има свой запис в историята и „назад“ го затваря, а адрес с
  // `?meal=` под него би го отворил пак. `?meal=` само отваря листа и се маха от адреса, преди листът да добави
  // записа си; иначе махането би заменило записа на листа.
  const [openMeal, setOpenMeal] = useState(search.meal ?? null);
  useEffect(() => {
    if (search.meal) {
      setOpenMeal(search.meal);
      void navigate({
        search: ({ meal: _, ...rest }) => rest,
        replace: true,
      });
    }
  }, [search.meal, navigate]);

  function showWeek(week: DateKey) {
    setOpenMeal(null);
    void navigate({ search: week === thisWeek ? {} : { week } });
  }

  return (
    <main className="screen recipes menu">
      <ScreenHeader title="Меню" start={!canEdit && <BackLink />} />
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
        openMealId={openMeal}
        sheetWaits={search.meal !== undefined}
        onOpenMeal={setOpenMeal}
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
  /** Ястието с отворен лист. */
  openMealId: string | null;
  /** Адресът още носи `?meal=`: листът чака, докато бъде махнат. */
  sheetWaits: boolean;
  onOpenMeal: (id: string | null) => void;
}

function Week({
  weekStart,
  readOnly,
  canDelete,
  voterId,
  today,
  proposalId,
  onProposal,
  openMealId,
  sheetWaits,
  onOpenMeal,
}: WeekProps) {
  const plan = usePlan(weekStart);
  const users = useUsers();
  const proposal = useMenuProposal(proposalId);
  // Седмица без план може да чака предложение (на когото и да е, и на крона) или да е изпуснала неуспешното;
  // планът от предложение казва кой го е поискал и с каква подсказка.
  // Неуспешното от адреса не спира седмицата: по-новото предложение (и чуждото) или готов план го изместват.
  const failed = proposal.data?.status === 'failed' ? proposal.data : undefined;
  const weekProposal = useWeekProposal(
    weekStart,
    proposalId === undefined || failed !== undefined,
  );
  const done = proposal.data?.status === 'done';
  useEffect(() => {
    if (done) {
      onProposal(undefined);
    }
  }, [done, onProposal]);
  const waitingFor = (request: MenuProposalRequest) =>
    waitingLabel(request, voterId, users.data ?? []);

  if (proposalId !== undefined && !done && !failed) {
    if (proposal.isError) {
      return (
        <ErrorBox
          error={proposal.error}
          onRetry={() => void proposal.refetch()}
        />
      );
    }
    if (!proposal.data) {
      return <Spinner />;
    }
    return (
      <ProposeForm
        key={formKey(proposal.data)}
        weekStart={weekStart}
        request={proposal.data}
        {...(proposal.data.status === 'pending'
          ? { waiting: waitingFor(proposal.data) }
          : {})}
        onProposal={onProposal}
      />
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
    if (weekProposal.isPending) {
      return <Spinner />;
    }
    const latest = newer(weekProposal.data ?? undefined, failed);
    // `done`, докато планът му още се чете.
    const waiting =
      latest &&
      (latest.status === 'pending' ||
        (latest.status === 'done' && plan.isFetching))
        ? waitingFor(latest)
        : undefined;
    if (readOnly) {
      return waiting ? (
        <Waiting label={waiting} scheduled={latest?.trigger === 'schedule'} />
      ) : (
        <p className="recipes__empty">Няма меню за тази седмица.</p>
      );
    }
    return (
      <ProposeForm
        key={formKey(latest)}
        weekStart={weekStart}
        request={latest}
        {...(waiting ? { waiting } : {})}
        onProposal={onProposal}
      />
    );
  }
  const latest = weekProposal.data;
  return (
    <PlanView
      plan={plan.data}
      proposal={
        latest?.status === 'done' && latest.planId === plan.data.id
          ? latest
          : undefined
      }
      users={users.data}
      readOnly={readOnly}
      canDelete={canDelete}
      voterId={voterId}
      today={today}
      openMealId={openMealId}
      sheetWaits={sheetWaits}
      onOpenMeal={onOpenMeal}
    />
  );
}

/** По-новото от двете предложения (по `createdAt`). */
function newer(
  a: MenuProposalRequest | undefined,
  b: MenuProposalRequest | undefined,
): MenuProposalRequest | undefined {
  if (!a || !b) {
    return a ?? b;
  }
  return Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a;
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

/** „Предложено от Дани · „повече риба““ над плана, направен от предложението на човек. */
function ProposedBy({
  proposal,
  users,
}: {
  proposal: MenuProposalRequest;
  users: User[];
}) {
  const name = requesterName(proposal, users);
  if (name === undefined) {
    return null;
  }
  return (
    <p className="menu__proposed-by">
      {withHint(`Предложено от ${name}`, proposal.hint)}
    </p>
  );
}

/** Името на човека, поискал предложението; `undefined` за крона и за непознат. */
function requesterName(
  request: MenuProposalRequest,
  users: User[],
): string | undefined {
  return users.find((user) => user.id === request.requestedBy)?.name;
}

/**
 * Кой съставя менюто: „Съставям меню…“ за своето предложение, „Дани съставя меню…“ за чуждото (и на kiosk, където
 * няма действащ потребител), „Съставям меню автоматично…“ за крона.
 */
function waitingLabel(
  request: MenuProposalRequest,
  actingUserId: string | null,
  users: User[],
): string {
  if (request.trigger === 'schedule') {
    return 'Съставям меню автоматично…';
  }
  const name = requesterName(request, users);
  return request.requestedBy === actingUserId || name === undefined
    ? 'Съставям меню…'
    : `${name} съставя меню…`;
}

/** Нова заявка или нов статус дава ново поле: при `failed` в него е подсказката на заявката. */
function formKey(request: MenuProposalRequest | undefined): string {
  return request ? `${request.id}:${request.status}` : 'none';
}

/** Предложението за меню още се съставя. */
function Waiting({
  label,
  scheduled = false,
}: {
  label: string;
  scheduled?: boolean;
}) {
  return (
    <div className="menu__waiting">
      {scheduled && <ScheduledNote />}
      <Spinner label="Изчакване…" />
      <p>{label}</p>
    </div>
  );
}

interface ProposeFormProps {
  weekStart: DateKey;
  onProposal: (id: string | undefined) => void;
  /**
   * Последното предложение на седмицата. `failed` дава съобщението си и подсказката си в полето; бутонът е „Опитай
   * пак“, освен ако го е пуснал кронът (никой още не е пробвал).
   */
  request?: MenuProposalRequest | undefined;
  /** Докато предложението се съставя: кой го съставя; подсказката и бутоните са изключени. */
  waiting?: string;
}

/** Седмица без план: „Предложи меню“ с подсказка или „Започни празно“. */
function ProposeForm({
  weekStart,
  onProposal,
  request,
  waiting,
}: ProposeFormProps) {
  const failed = request?.status === 'failed' ? request : undefined;
  const scheduled = request?.trigger === 'schedule';
  const [hint, setHint] = useState(failed?.hint ?? '');
  // Докато чака, полето показва подсказката на чакащото предложение.
  const shownHint = waiting ? (request?.hint ?? '') : hint;
  const propose = useProposeMenu();
  const createPlan = useCreatePlan();
  const missing = refusalOf(propose.error, 'not_enough_recipes');

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
      {waiting ? (
        <Waiting label={waiting} scheduled={scheduled} />
      ) : (
        scheduled && failed && <ScheduledNote />
      )}
      {failed && (
        <p className="error-box__message" role="alert">
          {failureMessage('menu', failed)}
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
          value={shownHint}
          disabled={waiting !== undefined}
          onChange={(event) => setHint(event.target.value)}
        />
        <span className="menu__counter">
          {shownHint.length}/{HINT_MAX}
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
        <button
          type="submit"
          className="button"
          disabled={propose.isPending || waiting !== undefined}
        >
          {failed && !scheduled ? 'Опитай пак' : 'Предложи меню'}
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={createPlan.isPending || waiting !== undefined}
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
  /** Предложението, от което е планът (последното на седмицата, с `planId` на плана). */
  proposal: MenuProposalRequest | undefined;
  users: User[];
  readOnly: boolean;
  canDelete: boolean;
  /** Действащият потребител, който гласува; `null` без гласове (kiosk). */
  voterId: string | null;
  today: DateKey;
  openMealId: string | null;
  sheetWaits: boolean;
  onOpenMeal: (id: string | null) => void;
}

/** Филтрите по изход на ястие, по реда в лентата; „Остава“ няма свой, защото е целта. */
const FILTERS = [
  'pending',
  'discuss',
  'replace',
] as const satisfies readonly MealOutcome[];

type Filter = (typeof FILTERS)[number] | 'all';

function PlanView({
  plan,
  proposal,
  users,
  readOnly,
  canDelete,
  voterId,
  today,
  openMealId,
  sheetWaits,
  onOpenMeal,
}: PlanViewProps) {
  const [chosen, setChosen] = useState<Filter>('all');
  const [pastOpen, setPastOpen] = useState(false);
  const [removed, setRemoved] = useState<RemovedRecipe | null>(null);
  const hideRemoved = useCallback(() => setRemoved(null), []);
  const mealsId = useId();
  const vote = useVote(plan.weekStart);
  const rate = useRateRecipe();
  const listedMealIds = new Set(
    useShoppingWeek(plan.weekStart).data?.list.listedMealIds,
  );
  const openMeal = plan.meals.find((meal) => meal.id === openMealId);
  // Ястието от адреса (известие) е някъде в седмицата: редът му идва в изгледа под листа. Докоснат ред вече се вижда.
  const fromUrl = useRef(openMealId);
  const openMealFound = openMeal !== undefined;
  useEffect(() => {
    if (openMealFound && fromUrl.current === openMealId && openMealId) {
      fromUrl.current = null;
      document
        .getElementById(mealRowId(openMealId))
        ?.scrollIntoView({ block: 'center' });
    }
  }, [openMealFound, openMealId]);
  const userIds = users.map((user) => user.id);
  const outcomeOf = (meal: MealPlan['meals'][number]) =>
    mealOutcome(meal, userIds);
  const coming = plan.meals.filter((meal) => !isPastMeal(meal, today));
  // Съгласуване има, докато в седмицата има ястие от днес нататък; празните дни чакат ястие, не глас.
  const agreement =
    voterId !== null && coming.some((meal) => outcomeOf(meal) !== null);
  const agreed = agreement && isAgreed(plan.meals, userIds, today);
  const counts = new Map(
    FILTERS.map((key) => [
      key,
      coming.filter((meal) => outcomeOf(meal) === key).length,
    ]),
  );
  // Лентата показва само филтри с ястия; при скрита лента или изпразнен филтър се вижда „Всички“, за да не остане
  // седмицата празна. Изборът не се пренаписва: изгледът винаги се извежда от него и от броя.
  const shownFilters = FILTERS.filter((key) => (counts.get(key) ?? 0) > 0);
  const filter: Filter =
    agreement && !agreed && chosen !== 'all' && shownFilters.includes(chosen)
      ? chosen
      : 'all';
  // Минали дни на текущата седмица: сгънати в един ред, за да не избутват днешния надолу.
  const past = plan.meals.filter((meal) => isPastMeal(meal, today));
  // Само на телефона с действащ потребител; kiosk и TV показват цялата седмица.
  const folds =
    voterId !== null &&
    filter === 'all' &&
    past.length > 0 &&
    coming.length > 0;
  const meals =
    filter === 'all'
      ? folds && !pastOpen
        ? coming
        : plan.meals
      : coming.filter((meal) => outcomeOf(meal) === filter);
  const list = (rows: ReactNode) => (
    <ol id={mealsId} className="menu__meals" aria-label="Вечери">
      {rows}
    </ol>
  );
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
      {plan.createdBy === null ? (
        <ScheduledNote />
      ) : (
        proposal && <ProposedBy proposal={proposal} users={users} />
      )}
      {agreed && (
        <p className="menu__agreed" role="status">
          <span aria-hidden="true">✓ </span>Менюто е съгласувано
        </p>
      )}
      {agreement && !agreed && (
        <div className="menu__filters" role="tablist" aria-label="Филтър">
          {(['all', ...shownFilters] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className="chip menu__filter"
              aria-selected={filter === key}
              onClick={() => setChosen(key)}
            >
              {key === 'all' ? (
                'Всички'
              ) : (
                <>
                  {OUTCOME_LABELS[key]}{' '}
                  <span className="menu__filter-count">{counts.get(key)}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      {vote.isError && <ErrorBox error={vote.error} />}
      {rate.isError && <ErrorBox error={rate.error} />}
      {folds && (
        <PastFold
          past={past}
          open={pastOpen}
          controls={mealsId}
          onToggle={() => setPastOpen((open) => !open)}
        />
      )}
      {voting && !readOnly ? (
        <MealDrag plan={plan}>
          {list(
            meals.map((meal) => (
              <DraggableMeal key={meal.id} meal={meal} today={today}>
                {(handle) => (
                  <MealRow
                    meal={meal}
                    users={users}
                    onOpen={() => onOpenMeal(meal.id)}
                    voting={voting}
                    handle={handle}
                    listed={listedMealIds.has(meal.id)}
                  />
                )}
              </DraggableMeal>
            )),
          )}
        </MealDrag>
      ) : (
        list(
          meals.map((meal) => (
            <li key={meal.id}>
              <MealRow
                meal={meal}
                users={users}
                {...(readOnly && !voting
                  ? {}
                  : { onOpen: () => onOpenMeal(meal.id) })}
                {...(voting ? { voting } : {})}
                listed={listedMealIds.has(meal.id)}
              />
            </li>
          )),
        )
      )}
      {meals.length === 0 && (
        <p className="recipes__empty">Няма такива ястия.</p>
      )}
      {plan.summary && <p className="menu__summary">{plan.summary}</p>}
      {!readOnly && canDelete && <DeletePlan plan={plan} />}
      {openMeal && !sheetWaits && (
        <MealSheet
          meal={openMeal}
          plan={plan}
          users={users}
          today={today}
          readOnly={readOnly}
          {...(voting ? { onVote: voting.onVote, voterId: voting.userId } : {})}
          onRecipeRemoved={setRemoved}
          onClose={() => onOpenMeal(null)}
        />
      )}
      <RemovedRecipeToast
        removed={removed}
        weekStart={plan.weekStart}
        onDone={hideRemoved}
      />
    </>
  );
}

/**
 * Сгънатите минали дни на текущата седмица: „Пн–Вт (минали)“. Докосването ги показва над днешния ред, с „Как беше?“.
 */
function PastFold({
  past,
  open,
  controls,
  onToggle,
}: {
  past: MealPlan['meals'];
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const first = past[0];
  const last = past[past.length - 1];
  if (!first || !last) {
    return null;
  }
  const days =
    first === last
      ? `${capitalize(formatWeekday(first.date))} (минал)`
      : `${capitalize(formatWeekday(first.date))}–${capitalize(formatWeekday(last.date))} (минали)`;
  return (
    <button
      type="button"
      className="menu__past-fold"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span>{days}</span>
      <span className="menu__past-fold-icon" aria-hidden="true">
        {open ? '▴' : '▾'}
      </span>
    </button>
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
