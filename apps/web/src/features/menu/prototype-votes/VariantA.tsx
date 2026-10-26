// PROTOTYPE (#63) вариант A: текущият списък, всеки ред носи двата гласа; „готово“ е автоматично, щом всички са „Остава“.
import { useState } from 'react';
import { formatDate, formatWeekday } from '../../../lib/format';
import { type Outcome, SLOT_LABEL, type VotesModel } from './model';
import {
  MealDetailSheet,
  MyVote,
  OutcomeChip,
  PersonVote,
  useSwapDrag,
} from './shared';

const FILTERS: [Outcome | 'all', string][] = [
  ['all', 'Всички'],
  ['discuss', 'Да поговорим'],
  ['replace', 'За смяна'],
  ['waiting', 'Чака глас'],
];

export function VariantA({ model }: { model: VotesModel }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Outcome | 'all'>('all');
  const drag = useSwapDrag(model.swap);
  const open = model.meals.find((meal) => meal.id === openId);
  const visible = model.meals.filter(
    (meal) =>
      (meal.slot === 'dinner' || meal.title) &&
      (filter === 'all' || model.outcome(meal) === filter),
  );

  return (
    <>
      {model.allAgreed ? (
        <p className="pv-banner pv-banner--ok">
          ✓ Менюто е съгласувано — списъкът за пазаруване е готов.
        </p>
      ) : (
        <div className="pv-filters" role="tablist">
          {FILTERS.map(([key, label]) => {
            const count = key === 'all' ? null : model.counts[key as Outcome];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                className="menu__tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
                {count ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>
      )}
      <ol className="menu__meals" aria-label="Хранения">
        {visible.map((meal) => {
          const outcome = model.outcome(meal);
          const last = meal.comments.at(-1);
          return (
            <li key={meal.id} {...drag.itemProps(meal.id)}>
              <div
                className={`pv-a-row pv-out--${outcome}`}
                onClick={() => setOpenId(meal.id)}
                onKeyDown={(event) =>
                  event.key === 'Enter' && setOpenId(meal.id)
                }
                role="button"
                tabIndex={0}
              >
                <span
                  className="pv-handle"
                  aria-label="Премести"
                  {...drag.handle(meal.id, model.locked)}
                >
                  ⠿
                </span>
                <span className="meal-row__day">
                  <span className="meal-row__weekday">
                    {formatWeekday(meal.date)}
                  </span>
                  <span className="meal-row__date">
                    {meal.slot === 'lunch'
                      ? SLOT_LABEL.lunch
                      : formatDate(meal.date)}
                  </span>
                </span>
                <span className="meal-row__main">
                  <span className="meal-row__title">
                    {meal.title ?? 'Избери ястие'}
                  </span>
                  {last ? (
                    <span className="meal-row__why">
                      💬 {last.userId ? `${model.name(last.userId)}: ` : ''}
                      {last.text}
                    </span>
                  ) : (
                    meal.why && (
                      <span className="meal-row__why">{meal.why}</span>
                    )
                  )}
                  {outcome !== 'agreed' && outcome !== 'waiting' && (
                    <OutcomeChip outcome={outcome} />
                  )}
                </span>
                <span className="pv-a-votes">
                  {model.partner && (
                    <PersonVote
                      model={model}
                      meal={meal}
                      userId={model.partner.id}
                    />
                  )}
                  <MyVote model={model} meal={meal} />
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {open && (
        <MealDetailSheet
          model={model}
          meal={open}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
