// PROTOTYPE (#63) вариант B: преглед ястие по ястие като тесте (гласът на другия се вижда едва след моя),
// после обобщение в три купчини; подреждането е отделен режим „докосни два дни, за да ги размениш“.
import { useState } from 'react';
import { formatDate, formatWeekday } from '../../../lib/format';
import { type Outcome, type PMeal, SLOT_LABEL, type VotesModel } from './model';
import {
  ChangeActions,
  MyVote,
  mealLabel,
  OutcomeChip,
  PersonVote,
  Thread,
} from './shared';

type Mode = 'review' | 'summary' | 'arrange';

export function VariantB({ model }: { model: VotesModel }) {
  const [mode, setMode] = useState<Mode>('review');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const meals = model.meals.filter((meal) => meal.title);
  const queue = meals.filter(
    (meal) => model.me && !meal.votes[model.me.id] && !skipped.has(meal.id),
  );
  const current = queue[0];
  const reviewed = meals.length - queue.length;

  return (
    <>
      <div className="menu__tabs" role="tablist">
        {(
          [
            ['review', `Преглед ${reviewed}/${meals.length}`],
            ['summary', 'Обобщение'],
            ['arrange', 'Подреди'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="menu__tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'review' &&
        (current ? (
          <ReviewCard
            key={current.id}
            model={model}
            meal={current}
            left={queue.length}
            onSkip={() => setSkipped(new Set(skipped).add(current.id))}
          />
        ) : (
          <div className="pv-b-done">
            <p className="pv-detail__title">Прегледа всичко ✓</p>
            <p className="pv-muted">
              {model.partner && waitingOn(model, meals)
                ? `Чакаме ${model.partner.name} да прегледа.`
                : 'И двамата прегледахте.'}
            </p>
            <button
              type="button"
              className="button"
              onClick={() => setMode('summary')}
            >
              Към обобщението
            </button>
          </div>
        ))}
      {mode === 'summary' && <Summary model={model} meals={meals} />}
      {mode === 'arrange' && <Arrange model={model} />}
    </>
  );
}

function waitingOn(model: VotesModel, meals: PMeal[]) {
  return meals.some((meal) => model.partner && !meal.votes[model.partner.id]);
}

function ReviewCard({
  model,
  meal,
  left,
  onSkip,
}: {
  model: VotesModel;
  meal: PMeal;
  left: number;
  onSkip: () => void;
}) {
  const [text, setText] = useState('');
  const partnerVoted = model.partner && meal.votes[model.partner.id];
  return (
    <article className="pv-b-card">
      <p className="pv-muted">
        {formatWeekday(meal.date)}, {formatDate(meal.date)} ·{' '}
        {SLOT_LABEL[meal.slot]} · остават {left}
      </p>
      <h2 className="pv-b-card__title">{meal.title}</h2>
      {meal.why && <p className="pv-muted">{meal.why}</p>}
      <p className="pv-muted">
        {partnerVoted
          ? `🔒 ${model.partner?.name} вече гласува — ще видиш след своя глас.`
          : `${model.partner?.name} още не е гласувал(а).`}
      </p>
      <input
        className="field__input"
        placeholder="Коментар (по желание)…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div
        onClickCapture={() => {
          if (text.trim()) model.comment(meal.id, text);
        }}
      >
        <MyVote model={model} meal={meal} big />
      </div>
      <button type="button" className="button button--quiet" onClick={onSkip}>
        Пропусни засега
      </button>
    </article>
  );
}

const PILES: [Outcome, string][] = [
  ['discuss', 'Да поговорим'],
  ['replace', 'За смяна'],
  ['waiting', 'Чака глас'],
  ['agreed', 'Остават'],
];

function Summary({ model, meals }: { model: VotesModel; meals: PMeal[] }) {
  const done = model.allAgreed;
  return (
    <div className="pv-b-summary">
      {done && (
        <p className="pv-banner pv-banner--ok">
          ✓ Готово — и двамата сте „за“ всяко ястие.
        </p>
      )}
      {PILES.map(([outcome, label]) => {
        const pile = meals.filter((meal) => model.outcome(meal) === outcome);
        if (pile.length === 0) return null;
        return (
          <section key={outcome} className={`pv-b-pile pv-out--${outcome}`}>
            <h3 className="pv-h3">
              {label} · {pile.length}
            </h3>
            {pile.map((meal) => (
              <details
                key={meal.id}
                className="pv-b-item"
                open={outcome !== 'agreed'}
              >
                <summary>
                  <span>
                    <strong>{meal.title}</strong>
                    <span className="pv-muted"> · {mealLabel(meal)}</span>
                  </span>
                  <span className="pv-detail__votes">
                    {model.users.map((user) => (
                      <PersonVote
                        key={user.id}
                        model={model}
                        meal={meal}
                        userId={user.id}
                      />
                    ))}
                  </span>
                </summary>
                {outcome === 'discuss' && <Thread model={model} meal={meal} />}
                {(outcome === 'discuss' || outcome === 'replace') && (
                  <ChangeActions model={model} meal={meal} />
                )}
                {outcome === 'discuss' && (
                  <div className="pv-muted">
                    Или промени гласа си: <MyVote model={model} meal={meal} />
                  </div>
                )}
                {outcome === 'waiting' && <OutcomeChip outcome="waiting" />}
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** Подреждане без влачене: докосни едно хранене, после друго — разменят се. */
function Arrange({ model }: { model: VotesModel }) {
  const [picked, setPicked] = useState<string | null>(null);
  const days = [...new Set(model.meals.map((meal) => meal.date))];
  return (
    <>
      <p className="pv-muted">
        {picked
          ? 'Сега докосни къде да отиде.'
          : 'Докосни ястие, после деня/храненето, където да отиде.'}
      </p>
      <div className="pv-b-arrange">
        {days.map((date) => (
          <div key={date} className="pv-b-arrange__day">
            <span className="meal-row__weekday">{formatWeekday(date)}</span>
            {model.meals
              .filter((meal) => meal.date === date)
              .map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  className={`pv-b-slot pv-out--${model.outcome(meal)}`}
                  aria-pressed={picked === meal.id}
                  disabled={model.locked}
                  onClick={() => {
                    if (picked === null) {
                      setPicked(meal.id);
                    } else {
                      model.swap(picked, meal.id);
                      setPicked(null);
                    }
                  }}
                >
                  <span className="pv-muted">{SLOT_LABEL[meal.slot]}</span>{' '}
                  {meal.title ?? '—'}
                </button>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}
