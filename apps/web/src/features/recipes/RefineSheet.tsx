import type { RecipeRefinement, RecipeStep } from '@family/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { StepPhotoThumbnail } from '../step-photos/StepPhotoThumbnail';
import { formatMinutes } from './format';
import { useRefinement, useRequestRefinement } from './refinements';

interface RefineSheetProps {
  recipeId: string;
  /** Стъпките на записаната рецепта: тях подобрява AI и с тях се сравнява. */
  steps: readonly RecipeStep[];
  /** „Приеми“: подобрението влиза във формата като незапазена промяна. */
  onAccept: (refinement: RecipeRefinement) => void;
  onClose: () => void;
}

/** „1 снимка не се свали.“, „2 снимки не се свалиха.“ */
function droppedText(count: number): string {
  return count === 1
    ? '1 снимка не се свали.'
    : `${count} снимки не се свалиха.`;
}

function StepList({
  name,
  steps,
}: {
  name: string;
  steps: readonly RecipeStep[];
}) {
  return (
    <section className="refine__column">
      <h3 className="refine__heading">{name}</h3>
      <ol className="refine__steps" aria-label={name}>
        {steps.map((step, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: стъпките нямат id; редът е идентичността им.
          <li key={index} className="refine__step">
            <span>{step.text}</span>
            {step.photoId && (
              <StepPhotoThumbnail
                photoId={step.photoId}
                label={`Снимката на стъпка ${index + 1} (${name.toLocaleLowerCase('bg')})`}
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * „✨ Подобри рецептата“ (`recipe.refine`): пуска заявката при отваряне, чака я и показва предложението до сегашните
 * стъпки. „Приеми“ го слага във формата, „Откажи“ не променя нищо. Рецептата се променя едва при „Запази“.
 */
export function RefineSheet({
  recipeId,
  steps,
  onAccept,
  onClose,
}: RefineSheetProps) {
  const start = useRequestRefinement();
  const [requestId, setRequestId] = useState<string>();
  const request = useRefinement(requestId);

  const { mutate } = start;
  function ask() {
    mutate(recipeId, { onSuccess: (created) => setRequestId(created.id) });
  }
  // Заявката тръгва веднъж, при отваряне (и в StrictMode, който монтира два пъти); „Опитай пак“ пуска нова.
  const asked = useRef(false);
  useEffect(() => {
    if (!asked.current) {
      asked.current = true;
      mutate(recipeId, { onSuccess: (created) => setRequestId(created.id) });
    }
  }, [mutate, recipeId]);

  const current = request.data;
  const retry = (
    <button
      type="button"
      className="button"
      disabled={start.isPending}
      onClick={ask}
    >
      Опитай пак
    </button>
  );

  let body: ReactNode;
  if (start.isError) {
    body = (
      <>
        <ErrorBox error={start.error} />
        {retry}
      </>
    );
  } else if (request.isError) {
    body = (
      <ErrorBox error={request.error} onRetry={() => void request.refetch()} />
    );
  } else if (!current || current.status === 'pending') {
    body = (
      <div className="refine__waiting">
        <Spinner label="Изчакване…" />
        <p>Мисля…</p>
      </div>
    );
  } else if (current.status === 'failed') {
    const message = failureMessage('refine', current);
    body =
      current.error === 'no_results' ? (
        <p role="status">
          {current.noResults ? `${message} ${current.noResults}` : message}
        </p>
      ) : (
        <>
          <p className="error-box__message" role="alert">
            {message}
          </p>
          {retry}
        </>
      );
  } else if (current.refinement) {
    const refinement = current.refinement;
    body = (
      <>
        <p>{refinement.changes}</p>
        {refinement.source === 'unread' && (
          <p className="refine__note">
            Източникът не се отвори — без нови снимки.
          </p>
        )}
        {refinement.droppedPhotos > 0 && (
          <p className="refine__note">
            {droppedText(refinement.droppedPhotos)}
          </p>
        )}
        {refinement.prepMinutes !== undefined && (
          <p>Време: {formatMinutes(refinement.prepMinutes)}</p>
        )}
        <div className="refine__compare">
          <StepList name="Сега" steps={steps} />
          <StepList name="Предложение" steps={refinement.steps} />
        </div>
        <div className="refine__actions">
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
          >
            Откажи
          </button>
          <button
            type="button"
            className="button"
            onClick={() => onAccept(refinement)}
          >
            Приеми
          </button>
        </div>
      </>
    );
  }

  return (
    <Sheet title="Подобри рецептата" onClose={onClose} closeLabel="Затвори">
      <div className="sheet__section refine">{body}</div>
    </Sheet>
  );
}
