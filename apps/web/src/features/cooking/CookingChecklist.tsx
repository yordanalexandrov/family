import { type Recipe, scaleQuantity } from '@family/shared';
import { useState } from 'react';
import { formatQuantity } from '../../lib/format';

interface CookingChecklistProps {
  ingredients: Recipe['ingredients'];
  /** Порциите, за които е написана рецептата. */
  recipeServings: number;
  /** Порциите на екрана; количествата са мащабирани към тях. */
  servings: number;
  /** Индексите на отметнатите („използвани“) редове в `ingredients`. */
  used: readonly number[];
  onToggleUsed: (index: number) => void;
}

/**
 * Продуктите на Готвене с отметки: неотметнатите в реда на рецептата, а отметнатите в група „Използвани (N)“ в
 * дъното, прибрана по подразбиране. Махането на отметката връща реда на мястото му.
 */
export function CookingChecklist({
  ingredients,
  recipeServings,
  servings,
  used,
  onToggleUsed,
}: CookingChecklistProps) {
  const [usedOpen, setUsedOpen] = useState(false);
  const lines = ingredients.map((line, index) => ({
    index,
    name: line.ingredient.name,
    amount: formatQuantity(scaleQuantity(line, recipeServings, servings)),
  }));
  const isUsed = (index: number) => used.includes(index);
  const renderLine = (line: (typeof lines)[number]) => (
    <li key={line.index} className="cooking-ingredients__line">
      <label className="cooking-ingredients__check">
        <input
          type="checkbox"
          checked={isUsed(line.index)}
          aria-label={`${line.name} ${line.amount}`}
          onChange={() => onToggleUsed(line.index)}
        />
        <span className="cooking-ingredients__name">{line.name}</span>
        <span className="cooking-ingredients__amount">{line.amount}</span>
      </label>
    </li>
  );
  const usedLines = lines.filter((line) => isUsed(line.index));

  return (
    <>
      <ul className="cooking-ingredients__lines" aria-label="Продукти">
        {lines.filter((line) => !isUsed(line.index)).map(renderLine)}
      </ul>
      {usedLines.length > 0 && (
        <div className="cooking-ingredients__used">
          <button
            type="button"
            className="button button--quiet cooking-ingredients__used-toggle"
            aria-expanded={usedOpen}
            aria-controls="cooking-ingredients-used"
            onClick={() => setUsedOpen(!usedOpen)}
          >
            Използвани ({usedLines.length})
          </button>
          {usedOpen && (
            <ul
              id="cooking-ingredients-used"
              className="cooking-ingredients__lines cooking-ingredients__lines--used"
              aria-label="Използвани"
            >
              {usedLines.map(renderLine)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
