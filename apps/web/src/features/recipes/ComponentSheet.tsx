import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import type { ComponentValues } from './recipe-form-values';

interface ComponentSheetProps {
  component: ComponentValues;
  /** Грешките на компонента от последния опит за запис, по поле. */
  errors: { name?: string | undefined; servings?: string | undefined };
  onChange: (patch: Partial<Omit<ComponentValues, 'key'>>) => void;
  /** Махане на компонента: редовете му се връщат при главните. */
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Лист за един компонент (GLOSSARY: Компонент) в `RecipeForm`: името, порциите, за които е написан, и „Премахни
 * компонент“. Редовете се местят в него от листа на реда.
 */
export function ComponentSheet({
  component,
  errors,
  onChange,
  onRemove,
  onClose,
}: ComponentSheetProps) {
  return (
    <Sheet title="Компонент" onClose={onClose}>
      <div className="recipe-form__row">
        <Field label="Име" error={errors.name}>
          {(props) => (
            <input
              {...props}
              className="field__input"
              value={component.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          )}
        </Field>
        <Field label="Порции" error={errors.servings}>
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
        <button
          type="button"
          className="button button--quiet"
          onClick={onRemove}
        >
          Премахни компонент
        </button>
      </div>
    </Sheet>
  );
}
