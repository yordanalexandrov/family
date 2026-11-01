import { RECIPE_REVISION_INSTRUCTION_MAX, type Recipe } from '@family/shared';
import { type FormEvent, useRef, useState } from 'react';
import { refusalOf } from '../../api/client';
import { useWritingUserId } from '../../app/acting-user';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Sheet } from '../../components/Sheet';
import { lastCookingApplied } from '../../lib/cooking-record';
import { useOnline } from '../../lib/use-online';
import { OpenRevisionBadge } from './OpenRevisionBadge';
import { useRateRecipe } from './queries';
import { useRequestRevision } from './revisions';
import { RatingStars } from './Stars';
import './recipes.css';

interface CookingFeedbackSheetProps {
  recipe: Recipe;
  /** „Пропусни“ или пуснатата поправка: обратната връзка е дадена. */
  onDone: () => void;
  /** Листът е затворен без решение (фонът, Escape, „назад“). */
  onClose: () => void;
}

/**
 * „Как мина?“ (GLOSSARY: Обратна връзка след готвене): звездите с текущата оценка (смяната се пише веднага), указание
 * „Какво да се промени?“ по избор, „Пропусни“ и „Изпрати“. Указанието пуска поправка на рецептата с приложените промени
 * за готвенето от последното готвене на това устройство днес (`applied`) и листът не чака AI;
 * празно поле само приключва. Рецепта с поправка, която чака преглед, не пуска втора: полето е изключено, а
 * „Поправка чака преглед“ води към нея (на kiosk, без потребител и редакция, е само текст). Без връзка „Изпрати“ е
 * изключено с „Иска връзка“. Работи и без действащ потребител.
 */
export function CookingFeedbackSheet({
  recipe,
  onDone,
  onClose,
}: CookingFeedbackSheetProps) {
  const [text, setText] = useState('');
  const skipRef = useRef<HTMLButtonElement>(null);
  const rate = useRateRecipe();
  const start = useRequestRevision();
  const trimmed = text.trim();
  const connection = useNeedsConnection(useOnline(), 'refine__hint');
  // Рецептата вече има поправка, която чака преглед (или тя е пусната от другия, докато листът е отворен): втора няма.
  const revisionOpen =
    recipe.openRevision !== null ||
    refusalOf(start.error, 'revision_open') !== null;
  // Редакцията пише от името на потребител; kiosk няма такъв и там поправката е само текст.
  const canEdit = useWritingUserId() !== null;

  // Указанието пуска поправка с приложените промени от последното готвене тук днес; празно поле само излиза, оценката
  // вече е записана.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (start.isPending || connection.disabled) {
      return;
    }
    if (trimmed === '' || revisionOpen) {
      onDone();
      return;
    }
    start.mutate(
      {
        target: { recipeId: recipe.id },
        instruction: trimmed,
        applied: lastCookingApplied(recipe.id),
      },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <Sheet title="Как мина?" onClose={onClose} hideClose focusRef={skipRef}>
      <form className="sheet__section refine feedback" onSubmit={submit}>
        <RatingStars
          rating={recipe.rating}
          onRate={(rating) => rate.mutate({ id: recipe.id, rating })}
        />
        {rate.isError && <ErrorBox error={rate.error} />}
        {revisionOpen && (
          <OpenRevisionBadge recipeId={recipe.id} canEdit={canEdit} />
        )}
        <Field label="Какво да се промени?">
          {(props) => (
            <textarea
              {...props}
              className="field__input refine__input"
              rows={3}
              maxLength={RECIPE_REVISION_INSTRUCTION_MAX}
              disabled={revisionOpen}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </Field>
        {start.isError && !revisionOpen && <ErrorBox error={start.error} />}
        <div className="refine__actions">
          <button
            ref={skipRef}
            type="button"
            className="button button--quiet"
            onClick={onDone}
          >
            Пропусни
          </button>
          {connection.hint}
          <button
            type="submit"
            className="button"
            disabled={start.isPending || connection.disabled}
            aria-describedby={connection.describedBy}
          >
            Изпрати
          </button>
        </div>
      </form>
    </Sheet>
  );
}
