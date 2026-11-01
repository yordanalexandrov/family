import type { Preparation, RecipeRefinement, RecipeStep } from '@family/shared';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Sheet } from '../../components/Sheet';
import { Spinner } from '../../components/Spinner';
import { failureMessage } from '../../lib/ai-requests';
import { PreparationList } from '../preparation/PreparationList';
import { StepPhotoThumbnail } from '../step-photos/StepPhotoThumbnail';
import { formatMinutes } from './format';
import { useRefinement, useRequestRefinement } from './refinements';

interface RefineSheetProps {
  recipeId: string;
  /** Стъпките на записаната рецепта: тях подобрява AI и с тях се сравнява. */
  steps: readonly RecipeStep[];
  /** Подготовката на записаната рецепта: с нея се сравнява предложената. */
  preparation: Preparation;
  /** Заявката, която листът чака: пусната при предишно отваряне и още неизчакана. Без нея листът пуска нова. */
  requestId: string | undefined;
  /** Листът пусна заявка (при отваряне или с „Опитай пак“). */
  onRequested: (requestId: string) => void;
  /** „Приеми“: подобрението влиза във формата като незапазена промяна. */
  onAccept: (refinement: RecipeRefinement) => void;
  /** `pending`: заявката още чака, и отвореният пак лист продължава нея. */
  onClose: (pending: boolean) => void;
}

/** „1 снимка не се свали.“, „2 снимки не се свалиха.“ */
function droppedText(count: number): string {
  return count === 1
    ? '1 снимка не се свали.'
    : `${count} снимки не се свалиха.`;
}

/**
 * Едната колона на сравнението: подготовката (ако я има в някоя от двете колони, иначе нищо) и стъпките. Без
 * подготовка в тази колона пише „Без подготовка“, за да личи, че „Приеми“ я маха или добавя.
 */
function Column({
  name,
  steps,
  preparation,
}: {
  name: string;
  steps: readonly RecipeStep[];
  /** `undefined`: и двете колони са без подготовка. */
  preparation: Preparation | undefined;
}) {
  return (
    <section className="refine__column">
      <h3 className="refine__heading">{name}</h3>
      {preparation &&
        (preparation.length > 0 ? (
          <PreparationList
            preparation={preparation}
            label={`Подготовка: ${name.toLocaleLowerCase('bg')}`}
          />
        ) : (
          <p className="refine__note refine__no-preparation">Без подготовка</p>
        ))}
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
 * „✨ Подобри рецептата“ (`recipe.refine`): пуска заявката при отваряне (или продължава чакащата), чака я и показва
 * предложението (стъпки и подготовка) до сегашните. „Приеми“ го слага във формата, „Откажи“ не променя нищо. Рецептата се променя
 * едва при „Запази“.
 */
export function RefineSheet({
  recipeId,
  steps,
  preparation,
  requestId,
  onRequested,
  onAccept,
  onClose,
}: RefineSheetProps) {
  const start = useRequestRefinement();
  const request = useRefinement(requestId);

  const { mutate } = start;
  const ask = useCallback(() => {
    mutate(recipeId, { onSuccess: (created) => onRequested(created.id) });
  }, [mutate, recipeId, onRequested]);
  // Нова заявка тръгва веднъж, при отваряне без чакаща (и в StrictMode, който монтира два пъти); „Опитай пак“ пуска нова.
  const asked = useRef(requestId !== undefined);
  useEffect(() => {
    if (!asked.current) {
      asked.current = true;
      ask();
    }
  }, [ask]);

  const current = request.data;
  const close = () => onClose(current?.status === 'pending');
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
    // Подобрение отпреди подготовката е без нея и не я сменя: няма какво да се сравнява.
    const proposed = refinement.preparation;
    const comparesPreparation =
      proposed !== undefined &&
      (preparation.length > 0 || proposed.length > 0);
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
          <Column
            name="Сега"
            steps={steps}
            preparation={comparesPreparation ? preparation : undefined}
          />
          <Column
            name="Предложение"
            steps={refinement.steps}
            preparation={comparesPreparation ? proposed : undefined}
          />
        </div>
        <div className="refine__actions">
          <button
            type="button"
            className="button button--quiet"
            onClick={close}
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
    <Sheet title="Подобри рецептата" onClose={close} closeLabel="Затвори">
      <div className="sheet__section refine">{body}</div>
    </Sheet>
  );
}
