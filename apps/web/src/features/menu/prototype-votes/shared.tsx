// PROTOTYPE (#63): общи дребни части на вариантите; оформлението е отделно във всеки вариант.
import { useNavigate } from '@tanstack/react-router';
import { type PointerEvent, useEffect, useState } from 'react';
import { Avatar } from '../../../components/Avatar';
import { Sheet } from '../../../components/Sheet';
import { formatWeekday } from '../../../lib/format';
import {
  OUTCOME_LABEL,
  type Outcome,
  type PMeal,
  SLOT_LABEL,
  type VotesModel,
} from './model';

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  return (
    <span className={`pv-chip pv-chip--${outcome}`}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

/** Моите 👍/👎: втори натиск на същия глас го маха. */
export function MyVote({
  model,
  meal,
  big = false,
}: {
  model: VotesModel;
  meal: PMeal;
  big?: boolean;
}) {
  const mine = model.me ? meal.votes[model.me.id] : undefined;
  const disabled = model.locked || !meal.title;
  return (
    <span className={`pv-myvote${big ? ' pv-myvote--big' : ''}`}>
      <button
        type="button"
        className="pv-vote pv-vote--down"
        aria-pressed={mine === 'down'}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          model.vote(meal.id, 'down');
        }}
      >
        👎{big && ' Не'}
      </button>
      <button
        type="button"
        className="pv-vote pv-vote--up"
        aria-pressed={mine === 'up'}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          model.vote(meal.id, 'up');
        }}
      >
        👍{big && ' Да'}
      </button>
    </span>
  );
}

/** Гласът на един човек: аватар с ✓ / ✗ / … отгоре. */
export function PersonVote({
  model,
  meal,
  userId,
}: {
  model: VotesModel;
  meal: PMeal;
  userId: string;
}) {
  const user = model.users.find((u) => u.id === userId);
  if (!user) return null;
  const vote = meal.votes[userId];
  return (
    <span
      className={`pv-person pv-person--${vote ?? 'none'}`}
      title={`${user.name}: ${vote === 'up' ? 'за' : vote === 'down' ? 'против' : 'още не е гласувал(а)'}`}
    >
      <Avatar initial={user.initial} color={user.color} size="sm" />
      <span className="pv-person__mark" aria-hidden="true">
        {vote === 'up' ? '✓' : vote === 'down' ? '✗' : '…'}
      </span>
    </span>
  );
}

export function mealLabel(meal: PMeal) {
  return `${formatWeekday(meal.date)} · ${SLOT_LABEL[meal.slot]}`;
}

/** Коментарите като разговор + поле за нов. */
export function Thread({ model, meal }: { model: VotesModel; meal: PMeal }) {
  const [text, setText] = useState('');
  return (
    <div className="pv-thread">
      {meal.comments.length === 0 && (
        <p className="pv-muted">Няма коментари.</p>
      )}
      {meal.comments.map((c) =>
        c.userId === null ? (
          <p key={c.id} className="pv-thread__system">
            {c.text}
          </p>
        ) : (
          <p
            key={c.id}
            className={`pv-thread__msg${c.userId === model.me?.id ? ' pv-thread__msg--mine' : ''}`}
          >
            <strong>{model.name(c.userId)}:</strong> {c.text}
          </p>
        ),
      )}
      {!model.locked && (
        <form
          className="pv-thread__form"
          onSubmit={(event) => {
            event.preventDefault();
            model.comment(meal.id, text);
            setText('');
          }}
        >
          <input
            className="field__input"
            placeholder="Коментар…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="button button--quiet">
            Прати
          </button>
        </form>
      )}
    </div>
  );
}

/** Смяна: „Предложи друго“ (AI, макет) или ръчно от регистъра. */
export function ChangeActions({
  model,
  meal,
}: {
  model: VotesModel;
  meal: PMeal;
}) {
  const [picking, setPicking] = useState(false);
  if (model.locked) return null;
  if (model.pending.has(meal.id)) {
    return <p className="pv-muted">AI търси друго за този ден…</p>;
  }
  return (
    <div className="pv-change">
      <div className="recipes__actions">
        <button
          type="button"
          className="button"
          onClick={() => model.suggestOther(meal.id)}
        >
          ✨ Предложи друго
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setPicking(!picking)}
        >
          Избери сам
        </button>
      </div>
      {picking && (
        <ul className="recipe-picker">
          {model.pool.map((title) => (
            <li key={title}>
              <button
                type="button"
                className="recipe-picker__option"
                onClick={() => {
                  model.replace(meal.id, title, null);
                  setPicking(false);
                }}
              >
                {title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Листът на ястие (варианти A и C): гласовете на двамата, моят глас, разговор, смяна. */
export function MealDetailSheet({
  model,
  meal,
  onClose,
}: {
  model: VotesModel;
  meal: PMeal;
  onClose: () => void;
}) {
  const outcome = model.outcome(meal);
  return (
    <Sheet title={mealLabel(meal)} onClose={onClose}>
      <section className="sheet__section">
        <p className="pv-detail__title">{meal.title ?? 'Няма ястие'}</p>
        {meal.why && <p className="pv-muted">{meal.why}</p>}
        <div className="pv-detail__votes">
          {model.users.map((user) => (
            <PersonVote
              key={user.id}
              model={model}
              meal={meal}
              userId={user.id}
            />
          ))}
          <OutcomeChip outcome={outcome} />
        </div>
        <MyVote model={model} meal={meal} big />
      </section>
      <section className="sheet__section">
        <h3 className="pv-h3">Разговор</h3>
        <Thread model={model} meal={meal} />
      </section>
      <section className="sheet__section">
        <h3 className="pv-h3">Смени</h3>
        <ChangeActions model={model} meal={meal} />
      </section>
    </Sheet>
  );
}

/**
 * Влачене с пръст (pointer events, работи на Android): дръжката хваща, пускането върху `[data-drop]` разменя.
 */
export function useSwapDrag(onDrop: (from: string, to: string) => void) {
  const [drag, setDrag] = useState<{
    id: string;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
  } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function targetAt(x: number, y: number, self: string) {
    for (const el of document.elementsFromPoint(x, y)) {
      const id = (el as HTMLElement)
        .closest?.('[data-drop]')
        ?.getAttribute('data-drop');
      if (id && id !== self) return id;
    }
    return null;
  }

  function handle(id: string, disabled = false) {
    return {
      style: { touchAction: 'none' as const },
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ id, x0: event.clientX, y0: event.clientY, dx: 0, dy: 0 });
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        if (!drag || drag.id !== id) return;
        setDrag({
          ...drag,
          dx: event.clientX - drag.x0,
          dy: event.clientY - drag.y0,
        });
        setOver(targetAt(event.clientX, event.clientY, id));
      },
      onPointerUp() {
        if (drag && over) onDrop(drag.id, over);
        setDrag(null);
        setOver(null);
      },
      onPointerCancel() {
        setDrag(null);
        setOver(null);
      },
      onClick(event: { stopPropagation: () => void }) {
        event.stopPropagation();
      },
    };
  }

  function itemProps(id: string) {
    const dragging = drag?.id === id;
    return {
      'data-drop': id,
      'data-over': over === id ? 'true' : undefined,
      'data-dragging': dragging ? 'true' : undefined,
      style: dragging
        ? {
            transform: `translate(${drag.dx}px, ${drag.dy}px)`,
            zIndex: 10,
            position: 'relative' as const,
          }
        : undefined,
    };
  }

  return { handle, itemProps, dragging: drag !== null };
}

export const VARIANTS = [
  ['A', 'Списък с гласове'],
  ['B', 'Преглед едно по едно'],
  ['C', 'Седмична решетка'],
] as const;

export type VariantKey = (typeof VARIANTS)[number][0];

/** Плаващият превключвател на прототипа; ← → на клавиатурата също. Само в dev. */
export function PrototypeSwitcher({ current }: { current: VariantKey }) {
  const navigate = useNavigate({ from: '/menu' });
  const index = VARIANTS.findIndex(([key]) => key === current);
  const go = (step: number) => {
    const [key] =
      VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length] ??
      VARIANTS[0];
    void navigate({
      search: (old: Record<string, unknown>) => ({ ...old, variant: key }),
      replace: true,
    });
  };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  if (!import.meta.env.DEV) return null;
  return (
    <div className="pv-switcher">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Предишен вариант"
      >
        ←
      </button>
      <span>
        {current} ({VARIANTS[index]?.[1]})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Следващ вариант">
        →
      </button>
    </div>
  );
}

/** Панелът на прототипа: кой гласува, симулация на другия, пълното състояние след всяко действие. */
export function StatePanel({ model }: { model: VotesModel }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={`pv-state${open ? ' pv-state--open' : ''}`}>
      <div className="pv-state__bar">
        <span>Гласувам като:</span>
        {model.users.map((user) => (
          <button
            key={user.id}
            type="button"
            aria-pressed={model.actingId === user.id}
            onClick={() => model.setActingId(user.id)}
          >
            {user.name}
          </button>
        ))}
        <button type="button" onClick={() => setOpen(!open)}>
          {open ? '▾ скрий' : '▸ състояние'}
        </button>
      </div>
      {open && (
        <div className="pv-state__body">
          <div className="pv-state__bar">
            <button type="button" onClick={model.partnerVotesAll}>
              {model.partner?.name} гласува за останалите
            </button>
            <button type="button" onClick={model.reset}>
              Нулирай
            </button>
          </div>
          <p>
            Остават {model.counts.agreed} · за смяна {model.counts.replace} ·
            говорим {model.counts.discuss} · чака {model.counts.waiting} ·
            празни {model.counts.empty} · всички съгласни:{' '}
            {model.allAgreed ? 'да' : 'не'} · заключено:{' '}
            {model.locked ? 'да' : 'не'}
          </p>
          <table>
            <tbody>
              {model.meals
                .filter((meal) => meal.title || meal.slot === 'dinner')
                .map((meal) => (
                  <tr key={meal.id}>
                    <td>{mealLabel(meal)}</td>
                    <td>{meal.title ?? '—'}</td>
                    <td>
                      {model.users
                        .map(
                          (u) =>
                            `${u.initial}${meal.votes[u.id] === 'up' ? '👍' : meal.votes[u.id] === 'down' ? '👎' : '·'}`,
                        )
                        .join(' ')}
                    </td>
                    <td>{OUTCOME_LABEL[model.outcome(meal)]}</td>
                    <td>💬{meal.comments.length}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <ol className="pv-state__log">
            {model.log.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: прототип
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
