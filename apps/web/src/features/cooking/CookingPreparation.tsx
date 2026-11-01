import {
  type Preparation,
  preparationKind,
  preparationLabel,
} from '@family/shared';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { useMediaQuery } from '../../lib/use-media-query';
import { PreparationItemLabel } from '../preparation/PreparationItemLabel';

/** Нисък екран (телефон легнал): същата граница като в `cooking.css`. */
export const LOW_SCREEN_QUERY = '(max-height: 32rem)';

interface CookingPreparationProps {
  preparation: Preparation;
  /** Кои елементи са направени, по един на елемент от `preparation`. */
  prepared: readonly boolean[];
  onToggle: (index: number) => void;
}

/**
 * Подготовката в Готвене (GLOSSARY): ред чипове над стъпката. Чипът е червен, докато не го докоснеш, а направеният е
 * зелен с отметка (`aria-pressed`). Когато всички са направени, редът се свива до зелен „Подготовка ✓“, който го
 * разгъва и прибира. На нисък екран (телефон легнал) редът е един обобщен чип с иконите на видовете и брояча
 * („🔥🧊 1/2“), който отваря лист с чиповете. Рецепта без подготовка няма ред.
 */
export function CookingPreparation(props: CookingPreparationProps) {
  const low = useMediaQuery(LOW_SCREEN_QUERY, false);
  if (props.preparation.length === 0) {
    return null;
  }
  return low ? (
    <CompactPreparation {...props} />
  ) : (
    <PreparationRow {...props} />
  );
}

function PreparationRow({
  preparation,
  prepared,
  onToggle,
}: CookingPreparationProps) {
  const [expanded, setExpanded] = useState(false);
  const allDone = prepared.every(Boolean);
  const toggle = (index: number) => {
    // Последният направен свива реда, дори ако е бил разгънат.
    if (prepared.every((done, other) => done || other === index)) {
      setExpanded(false);
    }
    onToggle(index);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: група бутони, не полета на форма; fieldset носи рамка и min-content ширина.
    <div className="cooking-preparation" role="group" aria-label="Подготовка">
      {allDone && (
        <button
          type="button"
          className="cooking-preparation__chip cooking-preparation__chip--done"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          Подготовка{' '}
          <span className="cooking-preparation__check" aria-hidden="true">
            ✓
          </span>
        </button>
      )}
      {(!allDone || expanded) && (
        <PreparationChips
          preparation={preparation}
          prepared={prepared}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

/**
 * Обобщеният чип на нисък екран: иконите на видовете и „отметнати/всички“, червен докато има неотметнат, зелен с ✓
 * след това. Думата „Подготовка“ е само в името му. Докосване отваря лист с пълните чипове.
 */
function CompactPreparation({
  preparation,
  prepared,
  onToggle,
}: CookingPreparationProps) {
  const [open, setOpen] = useState(false);
  const doneCount = prepared.filter(Boolean).length;
  const allDone = doneCount === preparation.length;
  const icons = [...new Set(preparation.map((item) => item.kind))].map(
    (kind) => preparationKind(kind).icon,
  );
  return (
    <div className="cooking-preparation">
      <button
        type="button"
        className={`cooking-preparation__chip cooking-preparation__summary${allDone ? ' cooking-preparation__chip--done' : ''}`}
        aria-label={`Подготовка: ${doneCount} от ${preparation.length} готови`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">{icons.join('')}</span>
        {allDone ? (
          <span className="cooking-preparation__check" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span aria-hidden="true">
            {doneCount}/{preparation.length} ▾
          </span>
        )}
      </button>
      {open && (
        <Sheet title="Подготовка" onClose={() => setOpen(false)}>
          <div className="sheet__section">
            {/* biome-ignore lint/a11y/useSemanticElements: група бутони, не полета на форма. */}
            <div
              className="cooking-preparation cooking-preparation--sheet"
              role="group"
              aria-label="Подготовка"
            >
              <PreparationChips
                preparation={preparation}
                prepared={prepared}
                onToggle={onToggle}
              />
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Чиповете на елементите: червен ненаправеният, зелен с отметка направеният (`aria-pressed`). */
function PreparationChips({
  preparation,
  prepared,
  onToggle,
}: CookingPreparationProps) {
  return preparation.map((item, index) => {
    const done = prepared[index] ?? false;
    return (
      <button
        // biome-ignore lint/suspicious/noArrayIndexKey: елементите нямат id, а редът им е смисълът.
        key={index}
        type="button"
        className={`cooking-preparation__chip${done ? ' cooking-preparation__chip--done' : ''}`}
        aria-pressed={done}
        // Името на вида и надписът с интервал: съседните span-ове иначе се слепват в името на бутона.
        aria-label={`${preparationKind(item.kind).labelBg} ${preparationLabel(item)}`}
        onClick={() => onToggle(index)}
      >
        <PreparationItemLabel item={item} />
        {done && (
          <span className="cooking-preparation__check" aria-hidden="true">
            ✓
          </span>
        )}
      </button>
    );
  });
}
