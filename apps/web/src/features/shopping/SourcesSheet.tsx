import type { ShoppingItem } from '@family/shared';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Sheet } from '../../components/Sheet';
import { formatAmounts, formatDayLong } from '../../lib/format';

/**
 * Менюто на реда, отворено с ⓘ: „От кои ястия“ (денят, рецептата и колко иска всяко ястие, което внася реда), „Скрий от
 * списъка“ и „Имаме го винаги“ за изчислен ред, чийто продукт още не е постоянен в килера; „Изтрий“ за ръчен ред.
 * Всички без „От кои ястия“ искат връзка и без нея са изключени с „Иска връзка“.
 */
export function SourcesSheet({
  item,
  online,
  onAlwaysHave,
  onHide,
  onDelete,
  onClose,
}: {
  item: ShoppingItem;
  online: boolean;
  onAlwaysHave: (item: ShoppingItem) => void;
  onHide: (item: ShoppingItem) => void;
  onDelete: (item: ShoppingItem) => void;
  onClose: () => void;
}) {
  if (item.kind === 'manual') {
    return (
      <Sheet title={item.title} onClose={onClose}>
        <p className="field__label">Добавен на ръка</p>
        <DeleteAction item={item} online={online} onDelete={onDelete} />
      </Sheet>
    );
  }
  const canMakeStaple =
    item.ingredientId !== undefined && item.pantry?.kind !== 'staple';
  return (
    <ComputedItemSheet
      item={item}
      online={online}
      canMakeStaple={canMakeStaple}
      onAlwaysHave={onAlwaysHave}
      onHide={onHide}
      onClose={onClose}
    />
  );
}

function ComputedItemSheet({
  item,
  online,
  canMakeStaple,
  onAlwaysHave,
  onHide,
  onClose,
}: {
  item: ShoppingItem;
  online: boolean;
  canMakeStaple: boolean;
  onAlwaysHave: (item: ShoppingItem) => void;
  onHide: (item: ShoppingItem) => void;
  onClose: () => void;
}) {
  const hideOffline = useNeedsConnection(online);
  const alwaysHaveOffline = useNeedsConnection(online);
  return (
    <Sheet title={item.title} onClose={onClose}>
      {item.sources.length > 0 ? (
        <>
          <p className="field__label">От кои ястия</p>
          <ul className="shopping__sources">
            {item.sources.map((source) => (
              <li key={source.mealId}>
                <span className="shopping__source-day">
                  {formatDayLong(source.date)}
                </span>{' '}
                · {source.recipeTitle}
                {source.amounts && source.amounts.length > 0
                  ? ` · ${formatAmounts(source.amounts)}`
                  : ''}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="field__label">Свърши в килера; менюто не го иска</p>
      )}
      <div className="shopping__sheet-actions">
        <button
          type="button"
          className="button button--quiet"
          disabled={hideOffline.disabled}
          aria-describedby={hideOffline.describedBy}
          onClick={() => onHide(item)}
        >
          Скрий от списъка
        </button>
        {hideOffline.hint}
      </div>
      {canMakeStaple && (
        <div className="shopping__sheet-actions">
          <button
            type="button"
            className="button"
            disabled={alwaysHaveOffline.disabled}
            aria-describedby={alwaysHaveOffline.describedBy}
            onClick={() => onAlwaysHave(item)}
          >
            Имаме го винаги
          </button>
          {alwaysHaveOffline.hint ?? (
            <p className="shopping__hint">
              Продуктът отива в килера като постоянен и не се показва в списъка.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** „Изтрий“ на ръчен ред: тръгва веднага, а „Върни“ в toast-а го добавя пак (#129 D-05). Без връзка е изключено. */
function DeleteAction({
  item,
  online,
  onDelete,
}: {
  item: ShoppingItem;
  online: boolean;
  onDelete: (item: ShoppingItem) => void;
}) {
  const offline = useNeedsConnection(online);
  return (
    <div className="shopping__sheet-actions">
      <button
        type="button"
        className="button button--quiet"
        disabled={offline.disabled}
        aria-describedby={offline.describedBy}
        onClick={() => onDelete(item)}
      >
        Изтрий
      </button>
      {offline.hint}
    </div>
  );
}
