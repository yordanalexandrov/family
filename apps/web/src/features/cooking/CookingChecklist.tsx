import { type CookingLine, scaleCookingLine } from '@family/shared';
import { useState } from 'react';
import { formatQuantity } from '../../lib/format';

/** Продуктите на Готвене с порциите и отметките: едно и също в колоната на широк екран и в листа на тесен. */
export interface CookingProducts {
  /** Редовете на рецептата с приложените промени за готвенето; всеки носи порциите, за които е количеството му. */
  lines: readonly CookingLine[];
  /** Порциите на екрана; количествата са мащабирани към тях. */
  servings: number;
  onServingsChange: (servings: number) => void;
  /** Индексите на отметнатите („използвани“) редове в `lines`. */
  used: readonly number[];
  onToggleUsed: (index: number) => void;
}

/** Отметнат е ред, който още е там и не е махнат от промяна. */
function isUsedLine({ lines, used }: CookingProducts, index: number): boolean {
  return used.includes(index) && lines[index]?.removed !== true;
}

/** Надписът на прибраните продукти: „Продукти (N)“, N е колко още не са отметнати (без махнатите). */
export function productsLabel(products: CookingProducts): string {
  const left = products.lines.filter(
    (line, index) => !line.removed && !isUsedLine(products, index),
  ).length;
  return `Продукти (${left})`;
}

/**
 * Продуктите на Готвене с отметки: неотметнатите в реда на рецептата, а отметнатите в група „Използвани (N)“ в
 * дъното, прибрана по подразбиране. Махането на отметката връща реда на мястото му. Ред от промяна за готвенето има
 * знак „променено“, а махнатият остава задраскан с „не се ползва“ и не се отмята.
 */
export function CookingChecklist({ products }: { products: CookingProducts }) {
  const { lines: source, servings, onToggleUsed } = products;
  const [usedOpen, setUsedOpen] = useState(false);
  const lines = source.map((line, index) => ({
    index,
    name: line.name,
    amount: formatQuantity(scaleCookingLine(line, servings)),
    changed: line.changed === true && line.removed !== true,
    removed: line.removed === true,
  }));
  const isUsed = (index: number) => isUsedLine(products, index);
  const renderLine = (line: (typeof lines)[number]) => (
    <li
      key={line.index}
      className={`cooking-ingredients__line${line.removed ? ' cooking-ingredients__line--removed' : ''}`}
    >
      <label className="cooking-ingredients__check">
        <input
          type="checkbox"
          checked={isUsed(line.index)}
          disabled={line.removed}
          aria-label={`${line.name} ${line.amount}`}
          onChange={() => onToggleUsed(line.index)}
        />
        <span className="cooking-ingredients__name">
          {line.name}
          {line.changed && (
            <span className="cooking-ingredients__mark">променено</span>
          )}
          {line.removed && (
            <span className="cooking-ingredients__mark">не се ползва</span>
          )}
        </span>
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
