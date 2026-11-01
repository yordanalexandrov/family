import {
  type Preparation,
  preparationKind,
  preparationLabel,
} from '@family/shared';
import { useState } from 'react';
import { PreparationItemLabel } from '../preparation/PreparationItemLabel';

interface CookingPreparationProps {
  preparation: Preparation;
  /** Кои елементи са направени, по един на елемент от `preparation`. */
  prepared: readonly boolean[];
  onToggle: (index: number) => void;
}

/**
 * Подготовката в Готвене (GLOSSARY): ред чипове над стъпката. Чипът е червен, докато не го докоснеш, а направеният е
 * зелен с отметка (`aria-pressed`). Когато всички са направени, редът се свива до зелен „Подготовка ✓“, който го
 * разгъва и прибира. Рецепта без подготовка няма ред.
 */
export function CookingPreparation({
  preparation,
  prepared,
  onToggle,
}: CookingPreparationProps) {
  const [expanded, setExpanded] = useState(false);
  if (preparation.length === 0) {
    return null;
  }
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
      {(!allDone || expanded) &&
        preparation.map((item, index) => {
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
              onClick={() => toggle(index)}
            >
              <PreparationItemLabel item={item} />
              {done && (
                <span className="cooking-preparation__check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
}
