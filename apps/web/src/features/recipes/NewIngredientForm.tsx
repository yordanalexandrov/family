import {
  AISLES,
  type Aisle,
  type BaseUnit,
  baseUnitSchema,
  createIngredientSchema,
  type Ingredient,
  UNIT_LABELS_BG,
} from '@family/shared';
import { useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { useCreateIngredient } from './queries';

interface NewIngredientFormProps {
  initialName: string;
  /** Основна единица по подразбиране, напр. по единицата в рецептата. */
  initialUnit?: BaseUnit;
  /** Щандът по подразбиране, напр. предложеният от внасянето; без него се избира. */
  initialAisle?: Aisle;
  onCreated: (ingredient: Ingredient) => void;
  onCancel: () => void;
}

/**
 * Мини форма „Нов продукт“ (име, основна единица, щанд) → `POST /api/ingredients`.
 * Не е `<form>`, защото стои вътре във формата на рецептата.
 */
export function NewIngredientForm({
  initialName,
  initialUnit = 'g',
  initialAisle,
  onCreated,
  onCancel,
}: NewIngredientFormProps) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<BaseUnit>(initialUnit);
  const [aisle, setAisle] = useState<Aisle | ''>(initialAisle ?? '');
  const [errors, setErrors] = useState<{ name?: string; aisle?: string }>({});
  const create = useCreateIngredient();
  const existing =
    create.data?.status === 'exists' ? create.data.ingredient : undefined;

  function submit() {
    const parsed = createIngredientSchema.safeParse({ name, unit, aisle });
    if (!parsed.success) {
      const paths = new Set(parsed.error.issues.map((i) => i.path[0]));
      setErrors({
        ...(paths.has('name') ? { name: 'Въведи име' } : {}),
        ...(paths.has('aisle') ? { aisle: 'Избери щанд' } : {}),
      });
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess(result) {
        if (result.status === 'created') {
          onCreated(result.ingredient);
        }
      },
    });
  }

  return (
    <fieldset
      className="new-ingredient"
      aria-label="Нов продукт"
      onKeyDown={(event) => {
        // Enter тук създава продукта, не праща формата на рецептата.
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <Field label="Име" error={errors.name}>
        {(props) => (
          <input
            {...props}
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <div className="recipe-form__row">
        <Field label="Основна единица">
          {(props) => (
            <select
              {...props}
              className="field__input"
              value={unit}
              onChange={(event) =>
                setUnit(baseUnitSchema.parse(event.target.value))
              }
            >
              {baseUnitSchema.options.map((option) => (
                <option key={option} value={option}>
                  {UNIT_LABELS_BG[option]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Щанд" error={errors.aisle}>
          {(props) => (
            <select
              {...props}
              className="field__input"
              value={aisle}
              onChange={(event) => setAisle(event.target.value as Aisle | '')}
            >
              <option value="">Избери…</option>
              {AISLES.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.labelBg}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {existing && (
        <div className="recipes__actions">
          <p className="field__error">
            Вече има „{existing.name}“, ползвай него
          </p>
          <button
            type="button"
            className="button"
            onClick={() => onCreated(existing)}
          >
            Избери „{existing.name}“
          </button>
        </div>
      )}
      {create.isError && <ErrorBox error={create.error} />}
      <div className="recipes__actions">
        <button
          type="button"
          className="button"
          disabled={create.isPending}
          onClick={submit}
        >
          Създай
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={onCancel}
        >
          Откажи
        </button>
      </div>
    </fieldset>
  );
}
