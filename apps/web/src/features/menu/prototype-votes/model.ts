// PROTOTYPE (#63): изхвърлим код, само на клон prototype/menu-votes. Състоянието е в паметта, нищо не стига до api-то.
import type { DateKey, MealPlan, User } from '@family/shared';
import { addDays } from '@family/shared';
import { useCallback, useMemo, useState } from 'react';
import { formatWeekday } from '../../../lib/format';

export type Vote = 'up' | 'down';
export type PSlot = 'lunch' | 'dinner';

export interface PComment {
  id: string;
  userId: string | null; // null = системен ред („Дани смени …“)
  text: string;
}

export interface PMeal {
  id: string;
  date: DateKey;
  slot: PSlot;
  title: string | null;
  why: string | null;
  votes: Record<string, Vote>;
  comments: PComment[];
  /** Макетно хранене (обяд от епик А), не идва от реалния план. */
  mock: boolean;
}

/**
 * Изходът на ястие за двамата: и двамата „за“ → остава; и двамата „против“ → сменя се; разногласие → говорим;
 * иначе чака гласа на някого.
 */
export type Outcome = 'agreed' | 'replace' | 'discuss' | 'waiting' | 'empty';

export function outcomeOf(meal: PMeal, users: User[]): Outcome {
  if (!meal.title) {
    return 'empty';
  }
  const votes = users.map((user) => meal.votes[user.id]);
  if (votes.some((vote) => vote === undefined)) {
    return 'waiting';
  }
  if (votes.every((vote) => vote === 'up')) {
    return 'agreed';
  }
  if (votes.every((vote) => vote === 'down')) {
    return 'replace';
  }
  return 'discuss';
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  agreed: 'Остава',
  replace: 'За смяна',
  discuss: 'Да поговорим',
  waiting: 'Чака глас',
  empty: 'Празно',
};

export const SLOT_LABEL: Record<PSlot, string> = {
  lunch: 'Обяд',
  dinner: 'Вечеря',
};

const SAMPLE_TITLES = [
  'Пиле с ориз',
  'Мусака',
  'Леща яхния',
  'Паста болонезе',
  'Сьомга на фурна',
  'Пълнени чушки',
  'Пица',
];

export const SAMPLE_POOL = [
  'Пилешка супа',
  'Кюфтета с картофено пюре',
  'Таратор и пържени тиквички',
  'Ризото с гъби',
  'Пиле в мултикукъра с кари',
  'Свинско с кисело зеле',
  'Гювеч зеленчуков',
  'Спагети карбонара',
];

const AI_WHY = [
  'Бързо е и не повтаря нищо от седмицата.',
  'Има ли повече зеленчуци тази седмица — по-леко.',
  'Ползва продукти, които вече са в списъка.',
  'Става в мултикукъра, докато сте навън.',
];

let seq = 0;
const nextId = () => `p${++seq}`;

/** Вечерите от реалния план (или примерни) + макетни обеди в събота и неделя, за да има „хранения“. */
export function seedMeals(
  plan: MealPlan | null,
  weekStart: DateKey,
  users: User[],
): PMeal[] {
  const [a, b] = users;
  const dinners: PMeal[] = Array.from({ length: 7 }, (_, day) => {
    const real = plan?.meals[day];
    return {
      id: nextId(),
      date: addDays(weekStart, day),
      slot: 'dinner',
      title: real ? (real.recipe?.title ?? real.note) : (SAMPLE_TITLES[day] ?? null),
      why: real?.why ?? null,
      votes: {},
      comments: [],
      mock: !real,
    };
  });
  // Малко начално разнообразие, за да се видят всички изходи веднага.
  if (a && b) {
    const set = (i: number, va?: Vote, vb?: Vote) => {
      const meal = dinners[i];
      if (meal?.title) {
        meal.votes = {
          ...(va ? { [a.id]: va } : {}),
          ...(vb ? { [b.id]: vb } : {}),
        };
      }
    };
    set(0, 'up', 'up');
    set(1, 'up', 'down');
    set(2, 'down', 'down');
    set(3, undefined, 'up');
    dinners[1]?.comments.push({
      id: nextId(),
      userId: b.id,
      text: 'Мусака имахме миналата седмица',
    });
  }
  const lunches: PMeal[] = Array.from({ length: 7 }, (_, day) => ({
    id: nextId(),
    date: addDays(weekStart, day),
    slot: 'lunch',
    title: day === 5 ? 'Палачинки (макет)' : null,
    why: null,
    votes: {},
    comments: [],
    mock: true,
  }));
  return [...dinners, ...lunches].sort(
    (x, y) => x.date.localeCompare(y.date) || (x.slot === 'lunch' ? -1 : 1),
  );
}

/** Целият модел на прототипа: гласове, коментари, смяна, AI „предложи друго“, размяна, „готово“. */
export function useVotesModel(
  plan: MealPlan | null,
  weekStart: DateKey,
  users: User[],
  pool: string[],
) {
  const [meals, setMeals] = useState(() => seedMeals(plan, weekStart, users));
  const [actingId, setActingId] = useState(users[0]?.id ?? '');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const me = users.find((user) => user.id === actingId) ?? users[0];
  const partner = users.find((user) => user.id !== me?.id);
  const name = useCallback(
    (id: string | null) => users.find((user) => user.id === id)?.name ?? '?',
    [users],
  );
  const note = (line: string) => setLog((old) => [line, ...old].slice(0, 12));
  const where = (id: string) => {
    const meal = meals.find((m) => m.id === id);
    return meal ? `${formatWeekday(meal.date)} ${SLOT_LABEL[meal.slot]}` : id;
  };

  const update = (id: string, change: (meal: PMeal) => PMeal) =>
    setMeals((old) =>
      old.map((meal) => (meal.id === id ? change(meal) : meal)),
    );

  function vote(id: string, value: Vote) {
    if (!me) return;
    update(id, (meal) => {
      const votes = { ...meal.votes };
      if (votes[me.id] === value) {
        delete votes[me.id];
      } else {
        votes[me.id] = value;
      }
      return { ...meal, votes };
    });
    note(`${me.name}: ${value === 'up' ? '👍' : '👎'} за ${where(id)}`);
  }

  function comment(id: string, text: string) {
    if (!me || !text.trim()) return;
    update(id, (meal) => ({
      ...meal,
      comments: [
        ...meal.comments,
        { id: nextId(), userId: me.id, text: text.trim() },
      ],
    }));
    note(`${me.name} коментира ${where(id)}`);
  }

  /** Смяната нулира гласа на другия; този, който сменя, автоматично е „за“ новото ястие. */
  function replace(id: string, title: string, why: string | null) {
    if (!me) return;
    update(id, (meal) => ({
      ...meal,
      title,
      why,
      votes: { [me.id]: 'up' },
      comments: [
        ...meal.comments,
        {
          id: nextId(),
          userId: null,
          text: `${me.name} смени „${meal.title ?? '—'}“ → „${title}“`,
        },
      ],
    }));
    note(`${me.name} смени ${where(id)} → ${title}`);
  }

  function suggestOther(id: string) {
    setPending((old) => new Set(old).add(id));
    note(`AI мисли за ${where(id)}…`);
    window.setTimeout(() => {
      const taken = new Set(meals.map((meal) => meal.title));
      const options = pool.filter((title) => !taken.has(title));
      const title =
        options[Math.floor(Math.random() * options.length)] ?? 'Омлет';
      const why = AI_WHY[Math.floor(Math.random() * AI_WHY.length)] ?? null;
      replace(id, title, `AI: ${why}`);
      setPending((old) => {
        const next = new Set(old);
        next.delete(id);
        return next;
      });
    }, 1400);
  }

  /** Местене: ястието (с гласовете и коментарите си) отива в друг ден/хранене; двете места се разменят. */
  function swap(fromId: string, toId: string) {
    if (fromId === toId) return;
    setMeals((old) => {
      const from = old.find((meal) => meal.id === fromId);
      const to = old.find((meal) => meal.id === toId);
      if (!from || !to) return old;
      const content = (meal: PMeal) => ({
        title: meal.title,
        why: meal.why,
        votes: meal.votes,
        comments: meal.comments,
      });
      return old.map((meal) =>
        meal.id === fromId
          ? { ...meal, ...content(to) }
          : meal.id === toId
            ? { ...meal, ...content(from) }
            : meal,
      );
    });
    note(`размяна ${where(fromId)} ↔ ${where(toId)}`);
  }

  /** Прототипът: „Поли“ гласува за всичко, по което още не е гласувала (произволно, 70% „за“). */
  function partnerVotesAll() {
    if (!partner) return;
    setMeals((old) =>
      old.map((meal) =>
        meal.title && !meal.votes[partner.id]
          ? {
              ...meal,
              votes: {
                ...meal.votes,
                [partner.id]: Math.random() < 0.7 ? 'up' : 'down',
              },
            }
          : meal,
      ),
    );
    note(`${partner.name} гласува за останалите`);
  }

  function reset() {
    setMeals(seedMeals(plan, weekStart, users));
    setLocked(false);
    setLog([]);
  }

  const outcomes = useMemo(
    () => meals.map((meal) => outcomeOf(meal, users)),
    [meals, users],
  );
  const counts = useMemo(() => {
    const result: Record<Outcome, number> = {
      agreed: 0,
      replace: 0,
      discuss: 0,
      waiting: 0,
      empty: 0,
    };
    for (const outcome of outcomes) result[outcome]++;
    return result;
  }, [outcomes]);
  const allAgreed = counts.agreed === meals.filter((m) => m.title).length;

  return {
    meals,
    users,
    me,
    partner,
    name,
    actingId,
    setActingId,
    pending,
    locked,
    setLocked: (value: boolean) => {
      setLocked(value);
      note(value ? 'менюто е заключено' : 'менюто е отключено');
    },
    log,
    counts,
    allAgreed,
    outcome: (meal: PMeal) => outcomeOf(meal, users),
    vote,
    comment,
    replace,
    suggestOther,
    swap,
    partnerVotesAll,
    reset,
    pool,
  };
}

export type VotesModel = ReturnType<typeof useVotesModel>;
