import {
  AISLES,
  type Aisle,
  createManualItemSchema,
  type DateKey,
  MANUAL_ITEM_TITLE_MAX,
  UNIT_LABELS_BG,
  type Unit,
  unitSchema,
} from '@family/shared';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Sheet } from '../../components/Sheet';
import { useOnline } from '../../lib/use-online';
import { useAddManualItem } from './queries';

// Ръчен ред „по вкус“ няма смисъл; останалите единици са по избор.
const UNITS = unitSchema.options.filter((unit) => unit !== 'pinch');

/**
 * „+ Добави“: ръчен ред (заглавие, количество, единица, щанд), валидиран с `createManualItemSchema`. Без връзка
 * „Добави“ е изключено с „Иска връзка“.
 */
export function AddItemSheet({
  weekStart,
  onClose,
}: {
  weekStart: DateKey;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit | ''>('');
  const [aisle, setAisle] = useState<Aisle>('other');
  const [errors, setErrors] = useState<{ title?: string; quantity?: string }>(
    {},
  );
  const add = useAddManualItem(weekStart);
  const online = useOnline();
  const offline = useNeedsConnection(online);

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = quantity.trim().replace(',', '.');
    const parsed = createManualItemSchema.safeParse({
      title,
      ...(amount ? { quantity: Number(amount) } : {}),
      ...(unit ? { unit } : {}),
      aisle,
    });
    if (!parsed.success) {
      const paths = new Set(parsed.error.issues.map((i) => i.path[0]));
      setErrors({
        ...(paths.has('title')
          ? { title: `Въведи заглавие до ${MANUAL_ITEM_TITLE_MAX} знака` }
          : {}),
        ...(paths.has('quantity')
          ? { quantity: 'Количеството е положително число' }
          : {}),
      });
      return;
    }
    setErrors({});
    add.mutate(parsed.data, { onSuccess: onClose });
  }

  return (
    <Sheet title="Добави" onClose={onClose}>
      <form className="shopping__form" noValidate onSubmit={submit}>
        <Field label="Заглавие" error={errors.title}>
          {(props) => (
            <input
              {...props}
              className="field__input"
              maxLength={MANUAL_ITEM_TITLE_MAX}
              placeholder="напр. кафе"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        <div className="shopping__form-row">
          <Field label="Количество" error={errors.quantity}>
            {(props) => (
              <input
                {...props}
                className="field__input"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            )}
          </Field>
          <Field label="Единица">
            {(props) => (
              <select
                {...props}
                className="field__input"
                value={unit}
                onChange={(event) => setUnit(event.target.value as Unit | '')}
              >
                <option value="">—</option>
                {UNITS.map((option) => (
                  <option key={option} value={option}>
                    {UNIT_LABELS_BG[option]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Щанд">
          {(props) => (
            <select
              {...props}
              className="field__input"
              value={aisle}
              onChange={(event) => setAisle(event.target.value as Aisle)}
            >
              {AISLES.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.labelBg}
                </option>
              ))}
            </select>
          )}
        </Field>
        {add.isError && online && <ErrorBox error={add.error} />}
        {/* На цялата ширина, както в килера. */}
        <button
          type="submit"
          className="button"
          disabled={offline.disabled || add.isPending}
          aria-describedby={offline.describedBy}
        >
          Добави
        </button>
        {offline.hint}
      </form>
    </Sheet>
  );
}
