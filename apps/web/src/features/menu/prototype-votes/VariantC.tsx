// PROTOTYPE (#63) вариант C: седмицата като решетка дни × хранения, плочки в цвета на изхода, влачене между
// клетки; „готово“ е изрично: „Заключи менюто“ се отключва, щом няма нищо за смяна, за говорене или чакащо.
import { useState } from 'react';
import { formatWeekday } from '../../../lib/format';
import { type PSlot, SLOT_LABEL, type VotesModel } from './model';
import { MealDetailSheet, PersonVote, useSwapDrag } from './shared';

const SLOTS: PSlot[] = ['lunch', 'dinner'];

export function VariantC({ model }: { model: VotesModel }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const drag = useSwapDrag(model.swap);
  const open = model.meals.find((meal) => meal.id === openId);
  const days = [...new Set(model.meals.map((meal) => meal.date))];
  const planned = model.meals.filter((meal) => meal.title).length;
  const blocking =
    model.counts.replace + model.counts.discuss + model.counts.waiting;

  return (
    <>
      <div className="pv-c-progress">
        <div
          className="pv-c-progress__bar"
          style={{
            inlineSize: `${(model.counts.agreed / Math.max(planned, 1)) * 100}%`,
          }}
        />
        <span>
          {model.counts.agreed}/{planned} съгласувани
          {model.counts.discuss > 0 && ` · ${model.counts.discuss} за говорене`}
          {model.counts.replace > 0 && ` · ${model.counts.replace} за смяна`}
        </span>
      </div>
      <div className="pv-c-grid">
        <span />
        {SLOTS.map((slot) => (
          <span key={slot} className="pv-c-head">
            {SLOT_LABEL[slot]}
          </span>
        ))}
        {days.map((date) => (
          <div key={date} className="pv-c-rowwrap">
            <span className="pv-c-day">
              <span className="meal-row__weekday">{formatWeekday(date)}</span>
              <span className="meal-row__date">{Number(date.slice(8))}</span>
            </span>
            {SLOTS.map((slot) => {
              const meal = model.meals.find(
                (m) => m.date === date && m.slot === slot,
              );
              if (!meal) return <span key={slot} />;
              const outcome = model.outcome(meal);
              return (
                <div
                  key={meal.id}
                  className={`pv-c-cell pv-out--${outcome}${meal.title ? '' : ' pv-c-cell--empty'}`}
                  {...drag.itemProps(meal.id)}
                >
                  {meal.title ? (
                    <button
                      type="button"
                      className="pv-c-tile"
                      onClick={() => setOpenId(meal.id)}
                    >
                      <span
                        className="pv-handle pv-handle--corner"
                        aria-label="Премести"
                        {...drag.handle(meal.id, model.locked)}
                      >
                        ⠿
                      </span>
                      <span className="pv-c-tile__title">{meal.title}</span>
                      <span className="pv-c-tile__foot">
                        {model.users.map((user) => (
                          <PersonVote
                            key={user.id}
                            model={model}
                            meal={meal}
                            userId={user.id}
                          />
                        ))}
                        {meal.comments.length > 0 && (
                          <span className="pv-muted">
                            💬{meal.comments.length}
                          </span>
                        )}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pv-c-tile pv-muted"
                      disabled={model.locked}
                      onClick={() => setOpenId(meal.id)}
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {model.locked ? (
        <div className="pv-banner pv-banner--ok">
          🔒 Менюто е заключено — списъкът за пазаруване се смята от него.{' '}
          <button
            type="button"
            className="button button--quiet"
            onClick={() => model.setLocked(false)}
          >
            Отключи
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button pv-c-lock"
          disabled={blocking > 0}
          onClick={() => model.setLocked(true)}
        >
          {blocking > 0
            ? `Заключи менюто (остават ${blocking})`
            : 'Заключи менюто'}
        </button>
      )}
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
