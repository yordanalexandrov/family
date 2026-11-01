import { PREPARATION_MAX } from '@family/shared';
import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PreparationKindIcon } from './PreparationItemLabel';
import {
  type PreparationItemErrors,
  PreparationSheet,
} from './PreparationSheet';
import {
  emptyPreparationItem,
  type PreparationItemValues,
  preparationValuesLabel,
} from './preparation-values';
import './preparation.css';

/** Новият индекс на всеки стар елемент след промяна на списъка; `undefined` — елементът е махнат. */
export type Reindex = (index: number) => number | undefined;

export interface PreparationFieldProps {
  items: readonly PreparationItemValues[];
  /**
   * Грешките по елемент и поле, с ключ `<индекс>.<поле>` (`0.degrees`, `1.text`), и `''` за целия списък. Ключовете
   * на `RecipeInput` без `preparation.` отпред.
   */
  errors: Readonly<Record<string, string>>;
  /** Новият списък; при местене и махане и как се местят индексите, за да последват грешките елемента си. */
  onChange: (items: PreparationItemValues[], reindex?: Reindex) => void;
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

function itemErrors(
  errors: Readonly<Record<string, string>>,
  index: number,
): PreparationItemErrors {
  const prefix = `${index}.`;
  return Object.fromEntries(
    Object.entries(errors)
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, message]) => [path.slice(prefix.length), message]),
  );
}

/**
 * Разделът „Подготовка“ на формата за рецепта (GLOSSARY: Подготовка): списък редове, „Добави подготовка“ и лист за един
 * елемент — добавяне, поправка, местене и махане, както стъпките. Контролиран: стойностите са у родителя.
 */
export function PreparationField({
  items,
  errors,
  onChange,
}: PreparationFieldProps) {
  /** Елементът в отворения лист; `added` — нов от „Добави подготовка“, махнат, ако се затвори без вид. */
  const [editing, setEditing] = useState<{
    index: number;
    added: boolean;
  } | null>(null);
  const errorIdPrefix = useId();
  // Листът мести фокуса при нов `onClose`; затварянето чете текущите стойности през ref.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const close = useCallback(() => {
    const current = editingRef.current;
    if (current?.added && itemsRef.current[current.index]?.kind === null) {
      const removed = current.index;
      onChangeRef.current(
        itemsRef.current.filter((_, index) => index !== removed),
        (index) => (index === removed ? undefined : index),
      );
    }
    setEditing(null);
  }, []);

  function add() {
    onChange([...items, emptyPreparationItem()]);
    setEditing({ index: items.length, added: true });
  }

  function moveItem(from: number, to: number) {
    const order = move(
      items.map((_, index) => index),
      from,
      to,
    );
    onChange(move(items, from, to), (index) => order.indexOf(index));
    setEditing((current) => current && { ...current, index: to });
  }

  function remove(removed: number) {
    onChange(
      items.filter((_, index) => index !== removed),
      (index) =>
        index === removed ? undefined : index > removed ? index - 1 : index,
    );
    setEditing(null);
  }

  const editingItem = editing ? items[editing.index] : undefined;
  const listError = errors[''];

  return (
    <fieldset className="recipe-form__section recipe-form__wide">
      <legend>Подготовка</legend>
      <p className="recipe-form__hint">
        Какво да се направи преди първата стъпка: фурна, изваждане, накисване…
      </p>
      {listError !== undefined && <p className="field__error">{listError}</p>}
      <ul className="step-lines preparation-lines" aria-label="Подготовка">
        {items.map((item, index) => {
          if (item.kind === null) {
            return null;
          }
          const [error] = Object.values(itemErrors(errors, index));
          const errorId = `${errorIdPrefix}-${index}-error`;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: елементите нямат id; редът е идентичността им.
            <li key={index} className="step-line">
              <button
                type="button"
                className="step-line__open preparation-line__open"
                aria-describedby={error === undefined ? undefined : errorId}
                onClick={() => setEditing({ index, added: false })}
              >
                <PreparationKindIcon kind={item.kind} />
                <span>{preparationValuesLabel(item)}</span>
              </button>
              {error !== undefined && (
                <p className="field__error step-line__error" id={errorId}>
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {items.length < PREPARATION_MAX && (
        <button type="button" className="button button--quiet" onClick={add}>
          Добави подготовка
        </button>
      )}
      {/* Листът е извън формата: Enter в поле не я праща. */}
      {editing &&
        editingItem &&
        createPortal(
          <PreparationSheet
            item={editingItem}
            number={editing.index + 1}
            count={items.length}
            ovenTaken={items.some(
              (item, index) => index !== editing.index && item.kind === 'oven',
            )}
            errors={itemErrors(errors, editing.index)}
            onChange={(patch) =>
              onChange(
                items.map((item, index) =>
                  index === editing.index ? { ...item, ...patch } : item,
                ),
              )
            }
            onMoveUp={() => moveItem(editing.index, editing.index - 1)}
            onMoveDown={() => moveItem(editing.index, editing.index + 1)}
            onRemove={() => remove(editing.index)}
            onClose={close}
          />,
          document.body,
        )}
    </fieldset>
  );
}
