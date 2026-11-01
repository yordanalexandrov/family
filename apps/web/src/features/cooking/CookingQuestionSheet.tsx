import {
  COOKING_QUESTION_MAX,
  type CookingChange,
  type CookingLine,
  type CookingQuestion,
  type Recipe,
  scaleQuantity,
} from '@family/shared';
import { type FormEvent, useRef, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { formatQuantity } from '../../lib/format';
import { useOnline } from '../../lib/use-online';
import { StepText } from '../timers/StepText';
import { isLostQuestion } from './questions';
import type { CookingChanges } from './use-cooking-changes';
import type { CookingQuestions } from './use-cooking-questions';
import type { CookingReading } from './use-cooking-reading';

/** От толкова знака нагоре под полето личи колко остават. */
const COUNT_FROM = COOKING_QUESTION_MAX - 50;

interface CookingQuestionSheetProps {
  /** Рецептата, която се готви: надписът на таймер, пуснат от време в отговора. */
  recipe: Pick<Recipe, 'id' | 'title'>;
  questions: CookingQuestions;
  /** Стъпката на екрана (индексът от 0): листът показва нейните въпроси, а другите са свити под „По-рано“. */
  step: number;
  /** Приложените промени за готвенето: „Промени“ и „Върни“ под отговор с промяна. */
  changes: CookingChanges;
  /** Порциите на екрана: количествата на промяната се показват за тях. */
  servings: number;
  /**
   * Четенето на глас на Готвене (`useCookingReading`): 🔊 до отговора чете през него, за да прекъсват отговорът и
   * стъпката едно друго.
   */
  reading: CookingReading;
  /**
   * Пуска въпрос за стъпката и порциите на екрана; с `replaces` — на мястото на неуспешен („Опитай пак“), за неговата
   * стъпка.
   */
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

/** Един запис на промяната, както се чете: „вместо домат: консерва pulp 200 г“, „без сол“, „добави захар 1 ч.л.“. */
function changeText(
  entry: CookingChange['ingredients'][number],
  lines: readonly CookingLine[],
  from: number,
  to: number,
): string {
  if (entry.kind === 'remove') {
    return `без ${lines[entry.index]?.name ?? `ред ${entry.index + 1}`}`;
  }
  const product = [
    entry.ingredient.name,
    formatQuantity(scaleQuantity(entry.ingredient, from, to)),
  ]
    .filter((part) => part !== '')
    .join(' ');
  if (entry.kind === 'add') {
    return `добави ${product}`;
  }
  return `вместо ${lines[entry.index]?.name ?? `ред ${entry.index + 1}`}: ${product}`;
}

/**
 * Промяната за готвенето под отговора: какво сменя (продуктите за порциите на екрана, после стъпките с новия им текст:
 * „стъпка 2: …“) и „Промени“; приложената — „Приложено“ и
 * „Върни“.
 */
function ChangeBlock({
  question,
  change,
  changes,
  servings,
}: {
  question: CookingQuestion;
  change: CookingChange;
  changes: CookingChanges;
  servings: number;
}) {
  const applied = changes.isApplied(question.id);
  const lines = changes.linesBefore(question.id);
  return (
    <div className="cooking-question__change">
      <ul className="cooking-question__change-list" aria-label="Промяна">
        {change.ingredients.map((entry, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: записите на промяната не се местят
          <li key={index}>
            {changeText(entry, lines, question.servings, servings)}
          </li>
        ))}
        {change.steps.map((entry) => (
          <li key={`step-${entry.number}`}>
            стъпка {entry.number}: {entry.text}
          </li>
        ))}
      </ul>
      <div className="cooking-question__change-actions">
        {applied ? (
          <>
            <p className="cooking-question__applied">Приложено</p>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => changes.revert(question.id)}
            >
              Върни
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => changes.apply({ ...question, change })}
          >
            Промени
          </button>
        )}
      </div>
    </div>
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
  changes,
  servings,
  reading,
}: {
  recipe: Pick<Recipe, 'id' | 'title'>;
  changes: CookingChanges;
  servings: number;
  reading: CookingReading;
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
          <Failed message={failureMessage('ask')} onRetry={onRetry} />
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
        <>
          <div className="cooking-question__answer-row">
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
            {reading.available && (
              <button
                type="button"
                className="button button--quiet cooking-question__read"
                aria-label="Прочети отговора"
                onClick={() => reading.readAnswer(question.answer ?? '')}
              >
                🔊
              </button>
            )}
          </div>
          {question.change && (
            <ChangeBlock
              question={question}
              change={question.change}
              changes={changes}
              servings={servings}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * Листът „Въпрос“ в Готвене (GLOSSARY: Въпрос в Готвене): въпросите, зададени на стъпката на екрана, с отговорите им и
 * поле за нов, с фокус при отваряне. Въпросите от другите стъпки (и запомнените отпреди стъпките) са свити под
 * „По-рано (n)“ и се отварят с едно докосване. Докато отговорът чака, пише „Мисли…“, а листът може да се затвори:
 * въпросите и заявките им остават в `CookingView` (`useCookingQuestions`), затова отговорът се вижда при следващото
 * отваряне. Новият въпрос продължава последния от същата стъпка (`follows`), затова полето е
 * изключено, докато въпрос на стъпката чака отговор. Отговор с промяна за готвенето има „Промени“, а приложената —
 * „Приложено“ и „Върни“, и под „По-рано“.
 */
export function CookingQuestionSheet({
  recipe,
  questions,
  step,
  changes,
  servings,
  reading,
  onAsk,
  onClose,
}: CookingQuestionSheetProps) {
  const { asked: remembered, results, start, replacing } = questions;
  const [text, setText] = useState('');
  const [earlierOpen, setEarlierOpen] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const connection = useNeedsConnection(useOnline(), 'cooking-question__hint');
  const items = remembered.map((asked, index) => ({
    ...asked,
    result: results[index],
  }));
  const current = items.filter((item) => item.step === step);
  const earlier = items.filter((item) => item.step !== step);
  const waiting =
    start.isPending ||
    current.some(({ result }) =>
      result?.data
        ? result.data.status === 'pending'
        : result?.isPending === true && !result.isError,
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

  const renderItem = ({
    id,
    question,
    result,
    step: asked,
  }: (typeof items)[number]) => (
    <li key={id} className="cooking-question__item">
      {asked !== undefined && asked !== step && (
        <p className="cooking-question__step">стъпка {asked + 1}</p>
      )}
      <QuestionItem
        recipe={recipe}
        asked={question}
        question={result?.data}
        error={result?.error}
        retrying={id === replacing}
        changes={changes}
        servings={servings}
        reading={reading}
        onRetry={() => onAsk(question, id)}
      />
    </li>
  );

  return (
    <Sheet title="Въпрос" onClose={onClose} focusRef={fieldRef}>
      <div className="sheet__section cooking-question">
        {earlier.length > 0 && (
          <div className="cooking-question__earlier">
            <button
              type="button"
              className="button button--quiet cooking-question__earlier-toggle"
              aria-expanded={earlierOpen}
              aria-controls="cooking-question-earlier"
              onClick={() => setEarlierOpen(!earlierOpen)}
            >
              По-рано ({earlier.length})
            </button>
            {earlierOpen && (
              <ol
                id="cooking-question-earlier"
                className="cooking-question__list"
                aria-label="По-рано"
              >
                {earlier.map(renderItem)}
              </ol>
            )}
          </div>
        )}
        {(current.length > 0 || asking !== undefined) && (
          <ol className="cooking-question__list" aria-label="Въпроси">
            {current.map(renderItem)}
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
          <Field label={`Твоят въпрос за стъпка ${step + 1}`}>
            {(props) => (
              <textarea
                {...props}
                ref={fieldRef}
                className="field__input cooking-question__input"
                rows={2}
                maxLength={COOKING_QUESTION_MAX}
                disabled={waiting}
                placeholder={
                  current.length > 0
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
