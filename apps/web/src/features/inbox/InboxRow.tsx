import type { InboxItem } from '@family/shared';
import { dateKeyInSofia } from '@family/shared';
import { useRouter } from '@tanstack/react-router';
import type { MouseEvent } from 'react';
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

/**
 * Един ред на Входящата кутия (`<li>`): час, заглавие, текст и точка за непрочетено (и по-плътен шрифт). Главата на
 * реда е линкът на известието: натискането прави записа прочетен и води към `url`. Подробностите и бутоните на
 * известието идват под главата, в същия `<li>`.
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

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    if (item.unread) {
      read.mutate(item.id);
    }
    void router.navigate({ href: item.url });
  }

  return (
    <li className="inbox-row" data-unread={item.unread}>
      <a
        className="inbox-row__head"
        href={item.url}
        onClick={open}
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
    </li>
  );
}

/**
 * Бутоните на известието („Извадих“, „Аз“), докато имат смисъл, или кой е отговорил („Поли вече готви“). Натиснат
 * бутон прочита записа; при отказ `cook_taken` редът казва кой готви.
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
          onClick={() => {
            action.mutate(button);
            if (item.unread) {
              read.mutate(item.id);
            }
          }}
        >
          {button.title}
        </button>
      ))}
    </div>
  );
}
