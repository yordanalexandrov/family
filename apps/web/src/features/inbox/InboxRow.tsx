import type { InboxItem } from '@family/shared';
import { dateKeyInSofia } from '@family/shared';
import { useRouter } from '@tanstack/react-router';
import { type MouseEvent, useState } from 'react';
import { refusalOf } from '../../api/client';
import { formatShortDate, formatTime } from '../../lib/format';
import { useInboxAction, useReadInboxItem } from './queries';

/** „18:00“, а в „По-рано“ — „2.11 · 18:00“. */
function when(item: InboxItem, withDate: boolean): string {
  const time = formatTime(item.updatedAt);
  return withDate
    ? `${formatShortDate(dateKeyInSofia(new Date(item.updatedAt)))} · ${time}`
    : time;
}

/** Обикновено натискане (без нов таб/прозорец) на линк, който води в приложението. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

/**
 * Един ред на Входящата кутия (`<li>`): час, заглавие, текст и точка за непрочетено (и по-плътен шрифт). Главата на
 * реда е линкът на известието: натискането прави записа прочетен и води към `url`. Под главата, в същия `<li>`:
 * „Още“ разгъва подробностите на място и прави записа прочетен; ред от подробностите с линк води натам. Без
 * подробности няма „Още“. Бутоните на известието идват също тук.
 */
export function InboxRow({
  item,
  withDate,
}: {
  item: InboxItem;
  withDate: boolean;
}) {
  const router = useRouter();
  const read = useReadInboxItem();
  const [expanded, setExpanded] = useState(false);
  const detailsId = `inbox-${item.id}-details`;

  function markRead() {
    if (item.unread) {
      read.mutate(item.id);
    }
  }

  /** Води към `href` в приложението; `alsoRead` прави записа прочетен. */
  function follow(href: string, alsoRead: boolean) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainClick(event)) {
        return;
      }
      event.preventDefault();
      if (alsoRead) {
        markRead();
      }
      void router.navigate({ href });
    };
  }

  function toggle() {
    if (!expanded) {
      markRead();
    }
    setExpanded(!expanded);
  }

  return (
    <li className="inbox-row" data-unread={item.unread}>
      <a
        className="inbox-row__head"
        href={item.url}
        onClick={follow(item.url, true)}
        aria-label={`${item.title}${item.unread ? ' · непрочетено' : ''}`}
        aria-describedby={`inbox-${item.id}-body`}
      >
        <span className="inbox-row__dot" aria-hidden="true" />
        <span className="inbox-row__main">
          <span className="inbox-row__title">{item.title}</span>
          <span className="inbox-row__body" id={`inbox-${item.id}-body`}>
            {item.body}
          </span>
        </span>
        <time className="inbox-row__time" dateTime={item.updatedAt}>
          {when(item, withDate)}
        </time>
      </a>
      <InboxActions item={item} />
      {item.details.length > 0 && (
        <div className="inbox-row__more">
          <button
            type="button"
            className="inbox-row__toggle"
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={toggle}
          >
            {expanded ? 'Скрий' : 'Още'}
          </button>
          {expanded && (
            <ul
              className="inbox-row__details"
              id={detailsId}
              aria-label={`Подробности: ${item.title}`}
            >
              {item.details.map((detail, index) => (
                // Редовете нямат id; редът им е от api-то и не се мени, докато записът е на екрана.
                // biome-ignore lint/suspicious/noArrayIndexKey: виж горе
                <li key={index} className="inbox-row__detail">
                  {detail.url ? (
                    <a href={detail.url} onClick={follow(detail.url, false)}>
                      {detail.text}
                    </a>
                  ) : (
                    detail.text
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Бутоните на известието („Извадих“, „Аз“), докато имат смисъл, или кой е отговорил („Поли вече готви“). Натиснат
 * бутон прочита записа след отговора; при отказ `cook_taken` редът казва кой готви.
 */
function InboxActions({ item }: { item: InboxItem }) {
  const action = useInboxAction();
  const read = useReadInboxItem();
  const taken = refusalOf(action.error, 'cook_taken');
  const answer = taken ? `${taken.cookName} вече готви` : item.answered?.text;

  if (answer) {
    return <p className="inbox-row__answered">{answer}</p>;
  }
  if (!item.actions?.length) {
    return null;
  }
  return (
    <div className="inbox-row__actions">
      {item.actions.map((button) => (
        <button
          key={button.action}
          type="button"
          className="button"
          disabled={action.isPending}
          onClick={() =>
            // Прочита се след отговора: „Аз“ обновява записа („Довечера готвиш ти“) и го прави непрочетен.
            action.mutate(button, { onSettled: () => read.mutate(item.id) })
          }
        >
          {button.title}
        </button>
      ))}
    </div>
  );
}
