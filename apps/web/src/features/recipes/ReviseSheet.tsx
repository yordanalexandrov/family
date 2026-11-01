import {
  type Preparation,
  RECIPE_REVISION_INSTRUCTION_MAX,
  type RecipeRevision,
  type RecipeStep,
} from '@family/shared';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { refusalOf } from '../../api/client';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { formatQuantity } from '../../lib/format';
import { useOnline } from '../../lib/use-online';
import { formatMinutes } from './format';
import { ComparisonColumn } from './RefineSheet';
import {
  type ComparedLine,
  type RevisionBase,
  type RevisionTarget,
  useRejectRevision,
  useRequestRevision,
  useRevision,
} from './revisions';

/** От толкова знака нагоре под полето личи колко остават. */
const COUNT_FROM = RECIPE_REVISION_INSTRUCTION_MAX - 50;

interface ReviseSheetProps {
  /** Рецептата, която AI поправя, и с която се сравнява: записаната, или формата за преглед на предложение. */
  recipe: RevisionBase;
  /** Къде се пуска поправката: на рецептата или на предложението, с рецептата от формата. */
  target: RevisionTarget;
  /** Поправката, която листът чака: пусната при предишно отваряне и още нерешена. Без нея листът иска указание. */
  requestId: string | undefined;
  /** Листът пусна поправка („Изпрати“ или „Опитай пак“). */
  onRequested: (requestId: string) => void;
  /** „Приеми“: поправката влиза във формата като незапазена промяна. */
  onAccept: (requestId: string, revision: RecipeRevision) => void;
  /** „Отхвърли“: поправката е отхвърлена и листът се затваря. */
  onRejected: () => void;
  /** `pending`: поправката още чака, и отвореният пак лист продължава нея. */
  onClose: (pending: boolean) => void;
}

/** „4 порции“, „1 порция“, с времето, ако го има: „4 порции · 45 мин“. */
function servingsText(servings: number, prepMinutes: number | undefined) {
  const portions = servings === 1 ? '1 порция' : `${servings} порции`;
  return prepMinutes === undefined
    ? portions
    : `${portions} · ${formatMinutes(prepMinutes)}`;
}

/** „черен пипер · по вкус (нов продукт)“, „червен пипер · 1 ч.л. (сладък)“. */
function lineText(line: ComparedLine): string {
  const name = line.ingredient?.name ?? line.newProduct?.name ?? '';
  const amount = formatQuantity(line);
  return [
    amount === '' ? name : `${name} · ${amount}`,
    line.note ? ` (${line.note})` : '',
    line.ingredient ? '' : ' (нов продукт)',
  ].join('');
}

/** „1 снимка отпада.“, „2 снимки отпадат.“ */
function droppedText(count: number): string {
  return count === 1 ? '1 снимка отпада.' : `${count} снимки отпадат.`;
}

/** Едната колона: порциите и времето, продуктите, подготовката и стъпките. */
function RevisionColumn({
  name,
  servings,
  prepMinutes,
  lines,
  steps,
  preparation,
}: {
  name: string;
  servings: number;
  prepMinutes: number | undefined;
  lines: readonly ComparedLine[];
  steps: readonly RecipeStep[];
  preparation: Preparation | undefined;
}) {
  const lower = name.toLocaleLowerCase('bg');
  return (
    <ComparisonColumn
      name={name}
      steps={steps}
      preparation={preparation}
      stepsLabel={`Стъпки: ${lower}`}
    >
      <p className="refine__note">{servingsText(servings, prepMinutes)}</p>
      <ul className="refine__lines" aria-label={`Продукти: ${lower}`}>
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: редовете нямат id; редът е идентичността им.
          <li key={index}>{lineText(line)}</li>
        ))}
      </ul>
    </ComparisonColumn>
  );
}

/**
 * „✏️ Поправи с AI“ (GLOSSARY: Поправка на рецепта): указание до 500 знака и „Изпрати“ (без връзка изключено с „Иска
 * връзка“), после „Мисли…“, докато AI работи (листът може да се затвори и отвори пак), и сравнението „Сега“ / „С
 * поправката“ с какво е сменено и „Ти написа: …“ отгоре. „Приеми“ слага поправката във формата, „Отхвърли“ я отхвърля.
 * Неуспехът има „Опитай пак“ със същото указание; „няма какво да се поправи“ казва причината и пуска ново указание.
 * Рецепта с поправка, която чака преглед, не пуска втора: листът води към чакащата. Записана след поправката рецепта
 * (`stale`) няма „Приеми“, а „Пусни пак“ отхвърля старата и пуска същото указание.
 */
export function ReviseSheet({
  recipe,
  target,
  requestId,
  onRequested,
  onAccept,
  onRejected,
  onClose,
}: ReviseSheetProps) {
  const start = useRequestRevision();
  const request = useRevision(requestId);
  const reject = useRejectRevision();
  const [text, setText] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const connection = useNeedsConnection(useOnline(), 'refine__hint');

  const send = (instruction: string) =>
    start.mutate(
      { target, instruction },
      { onSuccess: (created) => onRequested(created.id) },
    );
  const current = request.data;
  const close = () => onClose(current?.status === 'pending');
  const trimmed = text.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed === '' || start.isPending || connection.disabled) {
      return;
    }
    send(trimmed);
  };

  const form = (
    <form className="refine__form" onSubmit={submit}>
      <Field label="Какво да се промени?">
        {(props) => (
          <textarea
            {...props}
            ref={fieldRef}
            className="field__input refine__input"
            rows={3}
            maxLength={RECIPE_REVISION_INSTRUCTION_MAX}
            placeholder="напр. картофите искат още 20 минути"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      {text.length >= COUNT_FROM && (
        <p className="refine__note">
          {text.length}/{RECIPE_REVISION_INSTRUCTION_MAX}
        </p>
      )}
      <div className="refine__actions">
        {connection.hint}
        <button
          type="submit"
          className="button"
          disabled={trimmed === '' || start.isPending || connection.disabled}
          aria-describedby={connection.describedBy}
        >
          Изпрати
        </button>
      </div>
    </form>
  );
  const retry = (instruction: string) => (
    <button
      type="button"
      className="button"
      disabled={start.isPending || connection.disabled}
      onClick={() => send(instruction)}
    >
      Опитай пак
    </button>
  );

  // Рецептата вече има поправка, която чака преглед: листът води към нея.
  const openRevision = refusalOf(start.error, 'revision_open');

  let body: ReactNode;
  if (openRevision) {
    body = (
      <>
        <p role="status">Поправка чака преглед</p>
        <div className="refine__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              start.reset();
              onRequested(openRevision.revisionId);
            }}
          >
            Отвори поправката
          </button>
        </div>
      </>
    );
  } else if (start.isError) {
    body = (
      <>
        <ErrorBox error={start.error} />
        {start.variables && retry(start.variables.instruction)}
      </>
    );
  } else if (start.isPending) {
    body = <Waiting />;
  } else if (requestId === undefined) {
    body = form;
  } else if (request.isError) {
    body = (
      <ErrorBox error={request.error} onRetry={() => void request.refetch()} />
    );
  } else if (!current || current.status === 'pending') {
    body = (
      <>
        {current && <Instruction text={current.instruction} />}
        <Waiting />
      </>
    );
  } else if (current.status === 'failed') {
    const message = failureMessage('revise', current);
    body =
      current.error === 'no_results' ? (
        <>
          <Instruction text={current.instruction} />
          <p role="status">
            {current.noResults ? `${message} ${current.noResults}` : message}
          </p>
          {form}
        </>
      ) : (
        <>
          <Instruction text={current.instruction} />
          <p className="error-box__message" role="alert">
            {message}
          </p>
          {retry(current.instruction)}
        </>
      );
  } else if (current.revision) {
    const revision = current.revision;
    const comparesPreparation =
      recipe.preparation.length > 0 || revision.preparation.length > 0;
    body = (
      <>
        <p>{revision.changes}</p>
        <Instruction text={current.instruction} />
        {revision.droppedPhotos > 0 && (
          <p className="refine__note">{droppedText(revision.droppedPhotos)}</p>
        )}
        <div className="refine__compare">
          <RevisionColumn
            name="Сега"
            servings={recipe.servings}
            prepMinutes={recipe.prepMinutes}
            lines={recipe.ingredients}
            steps={recipe.steps}
            preparation={comparesPreparation ? recipe.preparation : undefined}
          />
          <RevisionColumn
            name="С поправката"
            servings={revision.servings}
            prepMinutes={revision.prepMinutes}
            lines={revision.ingredients}
            steps={revision.steps}
            preparation={comparesPreparation ? revision.preparation : undefined}
          />
        </div>
        {current.stale && (
          <p className="refine__note" role="status">
            Рецептата е записана след поправката.
          </p>
        )}
        {reject.isError && <ErrorBox error={reject.error} />}
        <div className="refine__actions">
          <button
            type="button"
            className="button button--quiet"
            disabled={reject.isPending}
            onClick={() =>
              reject.mutate(current.id, { onSuccess: () => onRejected() })
            }
          >
            Отхвърли
          </button>
          {current.stale ? (
            // Приемането би изтрило по-новия запис: старата се отхвърля и същото указание се пуска върху него.
            <button
              type="button"
              className="button"
              disabled={reject.isPending || connection.disabled}
              aria-describedby={connection.describedBy}
              onClick={() =>
                reject.mutate(current.id, {
                  onSuccess: () => send(current.instruction),
                })
              }
            >
              Пусни пак
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => onAccept(current.id, revision)}
            >
              Приеми
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <Sheet
      title="Поправи с AI"
      onClose={close}
      closeLabel="Затвори"
      {...(requestId === undefined ? { focusRef: fieldRef } : {})}
    >
      <div className="sheet__section refine">{body}</div>
    </Sheet>
  );
}

function Waiting() {
  return (
    <div className="refine__waiting">
      <Spinner label="Изчакване…" />
      <p>Мисли…</p>
    </div>
  );
}

function Instruction({ text }: { text: string }) {
  return <p className="refine__note">Ти написа: {text}</p>;
}
