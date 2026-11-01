import {
  COOKING_QUESTION_MAX,
  type CookingQuestion,
  type Recipe,
} from '@family/shared';
import { useQueries } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { useOnline } from '../../lib/use-online';
import { StepText } from '../timers/StepText';
import { cookingQuestionQuery, isLostQuestion } from './questions';
import type { CookingQuestions } from './use-cooking-questions';

/** От толкова знака нагоре под полето личи колко остават. */
const COUNT_FROM = COOKING_QUESTION_MAX - 50;

interface CookingQuestionSheetProps {
  /** Рецептата, която се готви: надписът на таймер, пуснат от време в отговора. */
  recipe: Pick<Recipe, 'id' | 'title'>;
  questions: CookingQuestions;
  /** Пуска въпрос за стъпката и порциите на екрана; с `replaces` — на мястото на неуспешен („Опитай пак“). */
  onAsk: (question: string, replaces?: string) => void;
  onClose: () => void;
}

function Waiting() {
  return (
    <div className="cooking-question__waiting">
      <Spinner label="Изчакване…" />
      <p>Мисли…</p>
    </div>
  );
}

function Failed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <>
      <p className="error-box__message" role="alert">
        {message}
      </p>
      <button type="button" className="button" onClick={onRetry}>
        Опитай пак
      </button>
    </>
  );
}

/**
 * Един зададен въпрос: текстът му и отговорът, „Мисли…“ или неуспехът с „Опитай пак“. Изгубен въпрос (api вече не го
 * знае) е неуспех като другите; текстът му е от паметта на устройството.
 */
function QuestionItem({
  recipe,
  asked,
  question,
  error,
  onRetry,
  retrying,
}: {
  recipe: Pick<Recipe, 'id' | 'title'>;
  /** Текстът на въпроса, както е запомнен на устройството. */
  asked: string;
  question: CookingQuestion | undefined;
  error: unknown;
  onRetry: () => void;
  /** „Опитай пак“ на този въпрос се праща: чака като нов. */
  retrying: boolean;
}) {
  if (!question) {
    return (
      <>
        <p className="cooking-question__asked">{asked}</p>
        {retrying || !error ? (
          <Waiting />
        ) : isLostQuestion(error) ? (
          <Failed
            // Без код на неуспеха: общото „AI не успя да отговори. Опитай пак.“
            message={failureMessage('ask', { createdAt: '' })}
            onRetry={onRetry}
          />
        ) : (
          <ErrorBox error={error} />
        )}
      </>
    );
  }
  return (
    <>
      <p className="cooking-question__asked">{question.question}</p>
      {question.status === 'pending' || retrying ? (
        <Waiting />
      ) : question.status === 'failed' ? (
        <Failed message={failureMessage('ask', question)} onRetry={onRetry} />
      ) : (
        <p className="cooking-question__answer">
          <StepText
            text={question.answer ?? ''}
            source={{
              recipeId: recipe.id,
              recipeTitle: recipe.title,
              step: question.step,
              question: true,
            }}
          />
        </p>
      )}
    </>
  );
}

/**
 * Листът „Въпрос“ в Готвене (GLOSSARY: Въпрос в Готвене): зададените въпроси с отговорите им и поле за нов. Докато
 * отговорът чака, пише „Мисли…“, а листът може да се затвори: чакането продължава в `CookingView` и отговорът се вижда
 * при следващото отваряне. Новият въпрос продължава последния (`follows`), затова полето е изключено, докато предишният
 * чака отговор.
 */
export function CookingQuestionSheet({
  recipe,
  questions,
  onAsk,
  onClose,
}: CookingQuestionSheetProps) {
  const { ids, asked: remembered, start, replacing } = questions;
  const [text, setText] = useState('');
  const results = useQueries({ queries: ids.map(cookingQuestionQuery) });
  const connection = useNeedsConnection(useOnline(), 'cooking-question__hint');
  const waiting =
    start.isPending ||
    results.some((result) =>
      result.data
        ? result.data.status === 'pending'
        : result.isPending && !result.isError,
    );
  const trimmed = text.trim();
  // Новият въпрос, докато `POST` още не е отговорил (повторният стои на мястото на неуспешния).
  const asking =
    start.isPending && replacing === undefined
      ? start.variables?.question
      : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed === '' || waiting || connection.disabled) {
      return;
    }
    onAsk(trimmed);
    setText('');
  };

  return (
    <Sheet title="Въпрос" onClose={onClose}>
      <div className="sheet__section cooking-question">
        {(ids.length > 0 || asking !== undefined) && (
          <ol className="cooking-question__list" aria-label="Въпроси">
            {remembered.map(({ id, question }, index) => (
              <li key={id} className="cooking-question__item">
                <QuestionItem
                  recipe={recipe}
                  asked={question}
                  question={results[index]?.data}
                  error={results[index]?.error}
                  retrying={id === replacing}
                  onRetry={() => onAsk(question, id)}
                />
              </li>
            ))}
            {asking !== undefined && (
              <li className="cooking-question__item">
                <p className="cooking-question__asked">{asking}</p>
                <Waiting />
              </li>
            )}
          </ol>
        )}
        {start.isError && (
          <ErrorBox
            error={start.error}
            onRetry={
              start.variables
                ? () => onAsk(start.variables.question)
                : undefined
            }
          />
        )}
        <form className="cooking-question__form" onSubmit={submit}>
          <Field label="Твоят въпрос">
            {(props) => (
              <textarea
                {...props}
                className="field__input cooking-question__input"
                rows={2}
                maxLength={COOKING_QUESTION_MAX}
                disabled={waiting}
                placeholder={
                  ids.length > 0
                    ? 'продължи, напр. а колко дълго тогава?'
                    : 'напр. мога ли да заменя доматите с консерва?'
                }
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    submit(event);
                  }
                }}
              />
            )}
          </Field>
          {text.length >= COUNT_FROM && (
            <p className="cooking-question__count">
              {text.length}/{COOKING_QUESTION_MAX}
            </p>
          )}
          <div className="cooking-question__actions">
            {connection.hint}
            <button
              type="submit"
              className="button"
              disabled={trimmed === '' || waiting || connection.disabled}
              aria-describedby={connection.describedBy}
            >
              Изпрати
            </button>
          </div>
        </form>
      </div>
    </Sheet>
  );
}
