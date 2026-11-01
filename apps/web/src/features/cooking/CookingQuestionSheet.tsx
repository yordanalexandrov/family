import { COOKING_QUESTION_MAX, type CookingQuestion } from '@family/shared';
import { useQueries } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { useOnline } from '../../lib/use-online';
import { cookingQuestionQuery } from './questions';
import type { CookingQuestions } from './use-cooking-questions';

/** От толкова знака нагоре под полето личи колко остават. */
const COUNT_FROM = COOKING_QUESTION_MAX - 50;

interface CookingQuestionSheetProps {
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

/** Един зададен въпрос: текстът му и отговорът, „Мисли…“ или неуспехът с „Опитай пак“. */
function QuestionItem({
  question,
  error,
  onRetry,
  retrying,
}: {
  question: CookingQuestion | undefined;
  error: unknown;
  onRetry: (question: CookingQuestion) => void;
  /** „Опитай пак“ на този въпрос се праща: чака като нов. */
  retrying: boolean;
}) {
  if (!question) {
    return error ? <ErrorBox error={error} /> : <Waiting />;
  }
  return (
    <>
      <p className="cooking-question__asked">{question.question}</p>
      {question.status === 'pending' || retrying ? (
        <Waiting />
      ) : question.status === 'failed' ? (
        <>
          <p className="error-box__message" role="alert">
            {failureMessage('ask', question)}
          </p>
          <button
            type="button"
            className="button"
            onClick={() => onRetry(question)}
          >
            Опитай пак
          </button>
        </>
      ) : (
        <p className="cooking-question__answer">{question.answer}</p>
      )}
    </>
  );
}

/**
 * Листът „Въпрос“ в Готвене (GLOSSARY: Въпрос в Готвене): зададените въпроси с отговорите им и поле за нов. Докато
 * отговорът чака, пише „Мисли…“, а листът може да се затвори: чакането продължава в `CookingView` и отговорът се вижда
 * при следващото отваряне. Нов въпрос се праща, когато предишният е отговорен.
 */
export function CookingQuestionSheet({
  questions,
  onAsk,
  onClose,
}: CookingQuestionSheetProps) {
  const { ids, start, replacing } = questions;
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
            {ids.map((id, index) => (
              <li key={id} className="cooking-question__item">
                <QuestionItem
                  question={results[index]?.data}
                  error={results[index]?.error}
                  retrying={id === replacing}
                  onRetry={(failed) => onAsk(failed.question, failed.id)}
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
                placeholder="напр. мога ли да заменя доматите с консерва?"
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
