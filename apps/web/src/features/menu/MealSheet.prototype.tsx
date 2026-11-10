// PROTOTYPE (throwaway): варианти на листа на деня, превключват се с ?variant= / лентата горе.
// Въпрос: как да подредим листа на деня, за да има йерархия? A = сегашният, B = Секции, C = Редове, D = Раздели.
// Без тестове, без грижа за грешки извън нужното. Не merge-вай в master.
import {
  isEmptyMeal,
  isPastMeal,
  MENU_REWORKING_MESSAGE,
  type Meal,
  mealOutcome,
  mealTitle,
  type UpdateMeal,
  type User,
} from '@family/shared';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import {
  PROTOTYPE_VARIANTS,
  type PrototypeVariant,
} from '../../components/PrototypeSwitcher';
import { Sheet } from '../../components/Sheet';
import { formatDayLong } from '../../lib/format';
import { useSetMealListed, useShoppingWeek } from '../shopping/queries';
import { MealReplace } from './MealReplace';
import {
  CookPicker,
  type MealSheetProps,
  NoteField,
  type RemovedRecipe,
  RecipePicker,
  ServingsEditor,
} from './MealSheet';
import { useSwapMeals, useThread, useUpdateMeal } from './queries';
import { Thread } from './Thread';
import { MyVote, OutcomeLabel, PersonVote, voteOf } from './Votes';
import './MealSheet.prototype.css';

const STORAGE_KEY = 'family.prototype.mealSheetVariant';

function isVariant(value: unknown): value is PrototypeVariant {
  return PROTOTYPE_VARIANTS.includes(value as PrototypeVariant);
}

/** ?variant= при отваряне, иначе последният избран (localStorage); роутерът на менюто маха непознатите параметри. */
export function usePrototypeVariant(): [
  PrototypeVariant,
  (v: PrototypeVariant) => void,
] {
  const [variant, setVariant] = useState<PrototypeVariant>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('variant');
    if (isVariant(fromUrl)) {
      return fromUrl;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    return isVariant(stored) ? stored : 'B';
  });
  const set = useCallback((v: PrototypeVariant) => {
    localStorage.setItem(STORAGE_KEY, v);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', v);
    window.history.replaceState(window.history.state, '', url);
    setVariant(v);
  }, []);
  return [variant, set];
}

/** Общото за трите варианта: състояние, мутации и контекстът на деня. */
function useMealModel(props: MealSheetProps) {
  const { meal, plan, today, readOnly = false, locked = false, voterId } =
    props;
  const update = useUpdateMeal(plan.weekStart);
  const title = mealTitle(meal);
  const past = readOnly || isPastMeal(meal, today);
  const empty = isEmptyMeal(meal);
  const canChange = !past && !locked;
  const myVote = voterId ? voteOf(meal, voterId) : undefined;
  const cook = props.users.find((u) => u.id === meal.cookUserId);
  const servings = Object.values(meal.servings).reduce((a, b) => a + b, 0);

  function patch(change: UpdateMeal) {
    update.mutate({ id: meal.id, patch: change });
  }
  function removeRecipe() {
    if (meal.recipeId === null) {
      return;
    }
    const before: RemovedRecipe = {
      mealId: meal.id,
      date: meal.date,
      title: title ?? '',
    };
    update.mutate(
      { id: meal.id, patch: { recipeId: null } },
      { onSuccess: () => props.onRecipeRemoved(before) },
    );
  }
  return {
    ...props,
    readOnly,
    locked,
    update,
    title,
    past,
    empty,
    canChange,
    myVote,
    cook,
    servings,
    patch,
    removeRecipe,
  };
}
type Model = ReturnType<typeof useMealModel>;

export function MealSheetPrototype({
  variant,
  ...props
}: MealSheetProps & { variant: PrototypeVariant }) {
  const m = useMealModel(props);
  return (
    <Sheet title={formatDayLong(m.meal.date)} onClose={m.onClose}>
      {m.update.isError && <ErrorBox error={m.update.error} />}
      {variant === 'B' && <VariantSections m={m} />}
      {variant === 'C' && <VariantRows m={m} />}
      {variant === 'D' && <VariantTabs m={m} />}
    </Sheet>
  );
}

/* ───────────── общи парчета ───────────── */

function Hero({
  m,
  summary = true,
  changed = false,
  children,
}: {
  m: Model;
  summary?: boolean;
  changed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`proto-hero${changed ? ' proto-hero--changed' : ''}`}>
      {m.title ? (
        m.meal.recipeId !== null ? (
          <Link
            to="/recipes/$id"
            params={{ id: m.meal.recipeId }}
            className="proto-hero__title proto-hero__title--link"
          >
            {m.title}
            <span aria-hidden="true" className="proto-hero__chevron">
              ›
            </span>
          </Link>
        ) : (
          <h3 className="proto-hero__title">{m.title}</h3>
        )
      ) : (
        <h3 className="proto-hero__title proto-hero__title--empty">
          Още няма ястие
        </h3>
      )}
      {m.meal.why && <p className="proto-hero__why">{m.meal.why}</p>}
      {children}
      {summary && !m.empty && <Summary m={m} />}
    </div>
  );
}

function Summary({ m }: { m: Model }) {
  const week = useShoppingWeek(m.plan.weekStart);
  const listed =
    week.data?.list.listedMealIds.includes(m.meal.id) ?? false;
  return (
    <p className="proto-summary">
      <span className="proto-summary__item">
        {m.cook ? (
          <Avatar initial={m.cook.initial} color={m.cook.color} size="sm" />
        ) : null}
        {m.cook ? `Готви ${m.cook.name}` : 'Без готвач'}
      </span>
      <span aria-hidden="true">·</span>
      <span>{m.servings} порции</span>
      {m.meal.recipeId !== null && (
        <>
          <span aria-hidden="true">·</span>
          <span>{listed ? '🛒 в списъка' : 'не е в списъка'}</span>
        </>
      )}
    </p>
  );
}

function CompactVotes({ m }: { m: Model }) {
  if (!m.voterId || m.empty) {
    return null;
  }
  return (
    <div className="proto-votes" role="group" aria-label="Гласове">
      <div className="proto-votes__people">
        {m.users.map((user) => (
          <PersonVote key={user.id} meal={m.meal} user={user} />
        ))}
        {!m.past && (
          <OutcomeLabel
            outcome={mealOutcome(
              m.meal,
              m.users.map((u) => u.id),
            )}
          />
        )}
      </div>
      {!m.past && m.onVote && m.voterId && (
        <MyVote
          meal={m.meal}
          userId={m.voterId}
          onVote={(value) => m.onVote?.(m.meal, value)}
          disabled={m.locked}
        />
      )}
    </div>
  );
}

function ThreadPreview({
  m,
  onOpen,
}: {
  m: Model;
  onOpen: () => void;
}) {
  const thread = useThread(m.plan.weekStart, m.meal.id);
  const lines = thread.data ?? [];
  const comments = lines.filter((l) => l.kind === 'comment');
  const last = comments.at(-1);
  const author = m.users.find((u) => u.id === last?.authorUserId);
  return (
    <button type="button" className="proto-row" onClick={onOpen}>
      <span className="proto-row__label">
        Разговор{comments.length > 0 ? ` · ${comments.length}` : ''}
      </span>
      <span className="proto-row__value proto-row__value--wrap">
        {last ? `${author?.name ?? 'Някой'}: ${last.body}` : 'Напиши нещо…'}
      </span>
      <span className="proto-row__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function ShoppingSwitch({ m }: { m: Model }) {
  const week = useShoppingWeek(m.plan.weekStart);
  const setListed = useSetMealListed(m.plan.weekStart);
  if (m.meal.recipeId === null || m.readOnly) {
    return null;
  }
  const listed =
    week.data?.list.listedMealIds.includes(m.meal.id) ?? false;
  return (
    <label className="proto-switch">
      <span>В списъка за пазаруване</span>
      <input
        type="checkbox"
        role="switch"
        checked={listed}
        disabled={!week.data || setListed.isPending}
        onChange={(e) =>
          setListed.mutate({ mealId: m.meal.id, listed: e.target.checked })
        }
      />
    </label>
  );
}

function SwapChips({ m, onDone }: { m: Model; onDone: () => void }) {
  const swap = useSwapMeals(m.plan.weekStart);
  const targets = m.plan.meals.filter(
    (t) =>
      t.id !== m.meal.id && t.slot === m.meal.slot && !isPastMeal(t, m.today),
  );
  return (
    <div className="chips">
      {swap.isError && <ErrorBox error={swap.error} />}
      {targets.map((t) => (
        <button
          key={t.id}
          type="button"
          className="chip move-meal__chip"
          disabled={swap.isPending}
          onClick={() =>
            swap.mutate({ meal: m.meal, withMeal: t }, { onSuccess: onDone })
          }
        >
          <span>{formatDayLong(t.date)}</span>{' '}
          <span className="move-meal__dish">{mealTitle(t) ?? 'празно'}</span>
        </button>
      ))}
    </div>
  );
}

type ChangeTool = 'replace' | 'pick' | 'swap' | 'note';

/** Току-що направената смяна: какво е било и как се връща (`null`, ако няма „Върни“). */
interface Change {
  from: string | null;
  undo: UpdateMeal | null;
}

/** „✓ Сменено“ под заглавието: потвърждава избора и дава „Върни“; изчезва след 8 s. */
function ChangedBanner({
  m,
  change,
  onDone,
}: {
  m: Model;
  change: Change | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!change) {
      return;
    }
    const id = setTimeout(onDone, 8000);
    return () => clearTimeout(id);
  }, [change, onDone]);
  if (!change) {
    return null;
  }
  return (
    <p className="proto-changed" role="status">
      <span>
        ✓ Сменено{change.from ? ` (беше „${change.from}“)` : ''}
      </span>
      {change.undo && (
        <button
          type="button"
          className="proto-link"
          onClick={() => {
            if (change.undo) {
              m.patch(change.undo);
            }
            onDone();
          }}
        >
          Върни
        </button>
      )}
    </p>
  );
}

/** Инструментите за смяна на ястието; `tool` е избраният, `onTool` го сменя. */
function ChangeTools({
  m,
  tool,
  onTool,
  omitReplace = false,
  onChanged,
}: {
  m: Model;
  tool: ChangeTool | null;
  onTool: (t: ChangeTool | null) => void;
  omitReplace?: boolean;
  /** Ястието е сменено: листът затваря инструмента и показва „✓ Сменено“ (с „Върни“, ако има какво да се върне). */
  onChanged?: (change: Change) => void;
}) {
  const before: Change = {
    from: m.title,
    // Без рецепта „Върни“ пак маха рецептата: денят остава празен или с бележката си.
    undo:
      m.meal.recipeId !== null
        ? { recipeId: m.meal.recipeId, ...(m.meal.why ? { why: m.meal.why } : {}) }
        : { recipeId: null },
  };
  function changeTo(patch: UpdateMeal, undoable = true) {
    m.patch(patch);
    onTool(null);
    onChanged?.(undoable ? before : { ...before, undo: null });
  }
  const tools: { key: ChangeTool; label: string }[] = [
    ...(omitReplace ? [] : [{ key: 'replace' as const, label: '✨ Предложи друго' }]),
    { key: 'pick', label: '🔍 Избери от рецептите' },
    ...(m.voterId ? [{ key: 'swap' as const, label: '⇄ Размени с друг ден' }] : []),
    { key: 'note', label: '📝 Бележка вместо ястие' },
  ];
  return (
    <div className="proto-tools">
      {tools.map((t) =>
        tool === t.key ? (
          <div key={t.key} className="proto-tools__open">
            <button
              type="button"
              className="proto-tools__item proto-tools__item--open"
              onClick={() => onTool(null)}
            >
              {t.label}
              <span aria-hidden="true">⌃</span>
            </button>
            {t.key === 'replace' && (
              <MealReplace
                key={m.meal.id}
                meal={m.meal}
                weekStart={m.plan.weekStart}
                onPick={({ recipeId, why }) => changeTo({ recipeId, why })}
              />
            )}
            {t.key === 'pick' && (
              <RecipePicker
                meal={m.meal}
                plan={m.plan}
                onPick={(patch) => changeTo(patch)}
                onRemove={m.removeRecipe}
              />
            )}
            {t.key === 'swap' && (
              <SwapChips
                m={m}
                onDone={() => {
                  onTool(null);
                  onChanged?.({ ...before, undo: null });
                }}
              />
            )}
            {t.key === 'note' && (
              <NoteField
                key={m.meal.note}
                meal={m.meal}
                onSave={(patch) => changeTo(patch, false)}
              />
            )}
          </div>
        ) : (
          <button
            key={t.key}
            type="button"
            className="proto-tools__item"
            onClick={() => onTool(t.key)}
          >
            {t.label}
            <span aria-hidden="true">›</span>
          </button>
        ),
      )}
      {m.meal.recipeId !== null && (
        <button
          type="button"
          className="proto-tools__item proto-tools__item--danger"
          onClick={m.removeRecipe}
        >
          Махни ястието от деня
        </button>
      )}
    </div>
  );
}

function PastNote({ m }: { m: Model }) {
  if (m.locked && !m.past) {
    return <p className="proto-note">{MENU_REWORKING_MESSAGE}</p>;
  }
  if (!m.past) {
    return null;
  }
  return (
    <p className="proto-note">
      {m.readOnly
        ? 'Седмицата е минала: менюто се чете, но не се сменя.'
        : 'Денят е минал: ястието не се сменя.'}
    </p>
  );
}

/** Празен ден: единствената задача е да се избере ястие, затова то е главното действие. */
function EmptyDayPrimary({
  m,
  onChanged,
}: {
  m: Model;
  onChanged?: (change: Change) => void;
}) {
  const [tool, setTool] = useState<ChangeTool | null>(null);
  return (
    <section className="proto-group proto-group--primary">
      <h4 className="proto-group__title">Какво ще ядем?</h4>
      <MealReplace
        key={m.meal.id}
        meal={m.meal}
        weekStart={m.plan.weekStart}
        onPick={({ recipeId, why }) => {
          m.patch({ recipeId, why });
          onChanged?.({ from: null, undo: { recipeId: null } });
        }}
      />
      <ChangeTools
        m={m}
        tool={tool}
        onTool={setTool}
        omitReplace
        {...(onChanged ? { onChanged } : {})}
      />
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="proto-group">
      <h4 className="proto-group__title">{title}</h4>
      {children}
    </section>
  );
}

/* ───────────── B: Секции ───────────── */

function VariantSections({ m }: { m: Model }) {
  const [threadOpen, setThreadOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [tool, setTool] = useState<ChangeTool | null>(null);
  return (
    <>
      <Hero m={m} />
      <CompactVotes m={m} />
      {m.empty && m.canChange && <EmptyDayPrimary m={m} />}
      {m.voterId &&
        (threadOpen ? (
          <div className="proto-thread">
            <Thread
              meal={m.meal}
              weekStart={m.plan.weekStart}
              users={m.users}
              userId={m.voterId}
              readOnly={m.past || m.locked}
            />
            <button
              type="button"
              className="proto-link"
              onClick={() => setThreadOpen(false)}
            >
              Скрий разговора
            </button>
          </div>
        ) : (
          <ThreadPreview m={m} onOpen={() => setThreadOpen(true)} />
        ))}
      {!m.readOnly && (
        <Group title="Подготовка">
          <CookPicker meal={m.meal} users={m.users} onPick={m.patch} />
          <ServingsEditor meal={m.meal} users={m.users} onChange={m.patch} />
          <ShoppingSwitch m={m} />
        </Group>
      )}
      <PastNote m={m} />
      {!m.empty && m.canChange && (
        <div className="proto-change">
          {changing ? (
            <Group title="Смени ястието">
              <ChangeTools m={m} tool={tool} onTool={setTool} />
            </Group>
          ) : (
            <button
              type="button"
              className="button button--quiet proto-change__button"
              onClick={() => setChanging(true)}
            >
              ↻ Смени ястието
            </button>
          )}
        </div>
      )}
    </>
  );
}

/* ───────────── C: Редове (drill-in) ───────────── */

type RowView = 'thread' | 'cook' | 'servings' | 'change' | null;

function VariantRows({ m }: { m: Model }) {
  const [view, setView] = useState<RowView>(null);
  const [tool, setTool] = useState<ChangeTool | null>(null);
  const [changed, setChanged] = useState<Change | null>(null);
  const clearChanged = useCallback(() => setChanged(null), []);
  function onChanged(change: Change) {
    setChanged(change);
    setView(null);
  }

  if (view) {
    const titles: Record<Exclude<RowView, null>, string> = {
      thread: 'Разговор',
      cook: 'Готвач',
      servings: 'Порции',
      change: 'Смени ястието',
    };
    return (
      <div className="proto-drill">
        <button
          type="button"
          className="proto-back"
          onClick={() => setView(null)}
        >
          ‹ {m.title ?? 'Назад'}
        </button>
        <h3 className="proto-drill__title">{titles[view]}</h3>
        {view === 'thread' && m.voterId && (
          <Thread
            meal={m.meal}
            weekStart={m.plan.weekStart}
            users={m.users}
            userId={m.voterId}
            readOnly={m.past || m.locked}
          />
        )}
        {view === 'cook' && (
          <CookPicker
            meal={m.meal}
            users={m.users}
            onPick={(c) => {
              m.patch(c);
              setView(null);
            }}
          />
        )}
        {view === 'servings' && (
          <ServingsEditor meal={m.meal} users={m.users} onChange={m.patch} />
        )}
        {view === 'change' && (
          <ChangeTools
            m={m}
            tool={tool}
            onTool={setTool}
            onChanged={onChanged}
          />
        )}
      </div>
    );
  }

  const needsMyVote = !m.past && !m.empty && m.voterId && !m.myVote;
  return (
    <>
      <Hero m={m} summary={false} changed={changed !== null}>
        <ChangedBanner m={m} change={changed} onDone={clearChanged} />
      </Hero>
      {needsMyVote && m.onVote && m.voterId && (
        <div className="proto-ask">
          <p className="proto-ask__q">Става ли за теб?</p>
          <MyVote
            meal={m.meal}
            userId={m.voterId}
            onVote={(value) => m.onVote?.(m.meal, value)}
            big
            disabled={m.locked}
          />
        </div>
      )}
      {m.empty && m.canChange && <EmptyDayPrimary m={m} onChanged={onChanged} />}
      <div className="proto-list">
        {m.voterId && !m.empty && !needsMyVote && (
          <div className="proto-row proto-row--static">
            <span className="proto-row__label">Гласове</span>
            <span className="proto-row__value">
              <CompactVotes m={m} />
            </span>
          </div>
        )}
        {m.voterId && (
          <ThreadPreview m={m} onOpen={() => setView('thread')} />
        )}
        {!m.readOnly && (
          <>
            <button
              type="button"
              className="proto-row"
              onClick={() => setView('cook')}
            >
              <span className="proto-row__label">Готвач</span>
              <span className="proto-row__value">
                {m.cook ? (
                  <>
                    <Avatar
                      initial={m.cook.initial}
                      color={m.cook.color}
                      size="sm"
                    />{' '}
                    {m.cook.name}
                  </>
                ) : (
                  'никой'
                )}
              </span>
              <span className="proto-row__chevron" aria-hidden="true">
                ›
              </span>
            </button>
            <button
              type="button"
              className="proto-row"
              onClick={() => setView('servings')}
            >
              <span className="proto-row__label">Порции</span>
              <span className="proto-row__value">
                {servingsText(m.meal, m.users)}
              </span>
              <span className="proto-row__chevron" aria-hidden="true">
                ›
              </span>
            </button>
            {m.meal.recipeId !== null && (
              <div className="proto-row proto-row--static">
                <ShoppingSwitch m={m} />
              </div>
            )}
          </>
        )}
        {!m.empty && m.canChange && (
          <button
            type="button"
            className="proto-row"
            onClick={() => setView('change')}
          >
            <span className="proto-row__label">↻ Смени ястието</span>
            <span className="proto-row__value" />
            <span className="proto-row__chevron" aria-hidden="true">
              ›
            </span>
          </button>
        )}
      </div>
      <PastNote m={m} />
    </>
  );
}

function servingsText(meal: Meal, users: User[]): string {
  const total = Object.values(meal.servings).reduce((a, b) => a + b, 0);
  const parts = users
    .map((u) => `${u.name} ${meal.servings[u.id] ?? 0}`)
    .join(', ');
  return `${total} (${parts})`;
}

/* ───────────── D: Раздели ───────────── */

type Tab = 'meal' | 'thread' | 'prep';

function VariantTabs({ m }: { m: Model }) {
  const [tab, setTab] = useState<Tab>('meal');
  const [tool, setTool] = useState<ChangeTool | null>(null);
  const thread = useThread(m.plan.weekStart, m.meal.id);
  const comments =
    thread.data?.filter((l) => l.kind === 'comment').length ?? 0;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'meal', label: 'Ястие' },
    ...(m.voterId
      ? [
          {
            key: 'thread' as const,
            label: comments ? `Разговор ${comments}` : 'Разговор',
          },
        ]
      : []),
    ...(!m.readOnly ? [{ key: 'prep' as const, label: 'Подготовка' }] : []),
  ];
  return (
    <>
      <Hero m={m} />
      <div className="menu__tabs proto-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className="menu__tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'meal' && (
        <>
          <CompactVotes m={m} />
          {m.empty && m.canChange && <EmptyDayPrimary m={m} />}
          {!m.empty && m.canChange && (
            <Group title="Смени ястието">
              <ChangeTools m={m} tool={tool} onTool={setTool} />
            </Group>
          )}
          <PastNote m={m} />
        </>
      )}
      {tab === 'thread' && m.voterId && (
        <Thread
          meal={m.meal}
          weekStart={m.plan.weekStart}
          users={m.users}
          userId={m.voterId}
          readOnly={m.past || m.locked}
        />
      )}
      {tab === 'prep' && (
        <>
          <CookPicker meal={m.meal} users={m.users} onPick={m.patch} />
          <ServingsEditor meal={m.meal} users={m.users} onChange={m.patch} />
          <ShoppingSwitch m={m} />
        </>
      )}
    </>
  );
}

