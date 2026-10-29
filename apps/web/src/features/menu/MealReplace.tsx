import type { DateKey, Meal, MealReplaceCandidate } from '@family/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { formatMinutes } from '../recipes/format';
import { useThread } from './queries';
import {
  changedSince,
  useLatestReplacement,
  useRequestReplacement,
} from './replacements';
import './MealReplace.css';

interface MealReplaceProps {
  meal: Meal;
  /** Седмицата на ястието: разговорът му казва дали е сменено след заявката. */
  weekStart: DateKey;
  /** Избраният кандидат: `PATCH` на ястието с неговите `recipeId` и `why`. */
  onPick: (candidate: MealReplaceCandidate) => void;
}

/**
 * „✨ Предложи друго“ (`meal.replace`): до 3 рецепти от регистъра, които AI избира и с оглед на разговора, всяка с
 * „защо“ и „Избери“. Докато агентът мисли, листът пита отново; при неуспех има „Опитай пак“. Отвореният пак лист
 * показва последната заявка на ястието: чакането, грешката или кандидатите, докато ястието не е сменено след нея.
 */
export function MealReplace({ meal, weekStart, onPick }: MealReplaceProps) {
  /** Заявката, чийто кандидат е избран току-що: листът не чака разговора, за да я скрие. */
  const [pickedId, setPickedId] = useState<string>();
  const start = useRequestReplacement();
  const replacement = useLatestReplacement(meal.id);
  const thread = useThread(weekStart, meal.id);

  function ask() {
    start.mutate(meal.id);
  }

  function pick(candidate: MealReplaceCandidate) {
    onPick(candidate);
    setPickedId(request?.id);
  }

  const askButton = (label: string) => (
    <button
      type="button"
      className="button"
      disabled={start.isPending}
      onClick={ask}
    >
      {label}
    </button>
  );

  const request = replacement.data;
  if (replacement.isError) {
    return (
      <ErrorBox
        error={replacement.error}
        onRetry={() => void replacement.refetch()}
      />
    );
  }
  const finishedWith =
    request?.status === 'done' &&
    (request.id === pickedId || changedSince(request, thread.data ?? []));
  if (!request || finishedWith) {
    return (
      <>
        {start.isError && <ErrorBox error={start.error} />}
        {askButton('✨ Предложи друго')}
      </>
    );
  }
  if (request?.status === 'failed') {
    return (
      <div className="meal-replace">
        <p className="error-box__message" role="alert">
          {failureMessage('replace', request)}
        </p>
        {askButton('Опитай пак')}
      </div>
    );
  }
  if (request?.status !== 'done') {
    return (
      <div className="meal-replace meal-replace--waiting">
        <Spinner label="Изчакване…" />
        <p>Мисля…</p>
      </div>
    );
  }
  return (
    <div className="meal-replace">
      <ul className="meal-replace__list" aria-label="Предложения">
        {(request.candidates ?? []).map((candidate) => (
          <li key={candidate.recipeId} className="meal-replace__card">
            <div className="meal-replace__head">
              <span className="meal-replace__title">{candidate.title}</span>
              {candidate.prepMinutes !== undefined && (
                <span className="meal-replace__time">
                  {formatMinutes(candidate.prepMinutes)}
                </span>
              )}
            </div>
            <p className="meal-replace__why">{candidate.why}</p>
            <button
              type="button"
              className="button"
              aria-label={`Избери „${candidate.title}“`}
              onClick={() => pick(candidate)}
            >
              Избери
            </button>
          </li>
        ))}
      </ul>
      <Link to="/recipes/suggest" className="meal-replace__more">
        Нищо не става? Поискай нови рецепти
      </Link>
    </div>
  );
}
