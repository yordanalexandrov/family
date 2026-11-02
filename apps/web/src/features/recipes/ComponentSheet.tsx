import { useRef, useState } from 'react';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { type ComponentValues, componentErrors } from './recipe-form-values';

interface ComponentSheetProps {
  component: ComponentValues;
  /** Грешките на компонента от последния опит за запис, по поле. */
  errors: { name?: string | undefined; servings?: string | undefined };
  onChange: (patch: Partial<Omit<ComponentValues, 'key'>>) => void;
  /** Махане на компонента: редовете му се връщат при главните. */
  onRemove: () => void;
  /**
   * Само за нов компонент от „+ Компонент“: „Добави“ го оставя във формата, щом има име и порции поне 1. Затварянето
   * на листа без него е отказ.
   */
  onAdd?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * Лист за един компонент (GLOSSARY: Компонент) в `RecipeForm`: името, порциите, за които е написан, и „Премахни
 * компонент“. Новият е с празни порции (компонентът е за други порции от рецептата), фокус в името, „Добави“ и
 * „Затвори“ вместо „Готово“. Редовете се местят в него от листа на реда.
 */
export function ComponentSheet({
  component,
  errors,
  onChange,
  onRemove,
  onAdd,
  onClose,
}: ComponentSheetProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  /** Грешките от последното „Добави“; заместват тези от записа. */
  const [addErrors, setAddErrors] = useState<
    ReturnType<typeof componentErrors> | undefined
  >();
  const shown = addErrors ?? errors;

  function add() {
    const found = componentErrors(component);
    if (found.name === undefined && found.servings === undefined) {
      onAdd?.();
      return;
    }
    setAddErrors(found);
  }

  return (
    <Sheet
      title="Компонент"
      onClose={onClose}
      {...(onAdd ? { closeLabel: 'Затвори', focusRef: nameRef } : {})}
    >
      <div className="recipe-form__row">
        <Field label="Име" error={shown.name}>
          {(props) => (
            <input
              {...props}
              ref={nameRef}
              className="field__input"
              value={component.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          )}
        </Field>
        <Field label="Порции" error={shown.servings}>
          {(props) => (
            <input
              {...props}
              className="field__input"
              inputMode="numeric"
              value={component.servings}
              onChange={(event) => onChange({ servings: event.target.value })}
            />
          )}
        </Field>
      </div>
      <p className="recipe-form__hint">
        Част, която се прави на отделна партида, напр. песто за 5 порции към
        ризото за 1.
      </p>
      <div className="recipes__actions">
        {onAdd ? (
          <button type="button" className="button" onClick={add}>
            Добави
          </button>
        ) : (
          <button
            type="button"
            className="button button--quiet"
            onClick={onRemove}
          >
            Премахни компонент
          </button>
        )}
      </div>
    </Sheet>
  );
}
