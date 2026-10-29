import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

/*
 * Стъклена карта (GLOSSARY: карта): фон, 1px контур, вътрешен отблясък.
 * Слотове: заглавие (`title`, по желание с `aside` вдясно), действие до заглавието
 * (`action`, извън h2, напр. иконата за обновяване), тяло (`children`) и
 * жълт надпис за остарели данни (`stale`). `interactive` дава фокус-рамка и
 * натискане. Карта-връзка е `as="a"` с `href`; `button` не е позволен, защото
 * заглавието (h2) и тялото (div) не са валидно съдържание на бутон.
 */
type CardElement = 'section' | 'article' | 'div' | 'li' | 'a';

interface BaseCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: CardElement;
  aside?: ReactNode;
  stale?: ReactNode;
  interactive?: boolean;
  href?: string;
}

/** Действието стои до заглавието, затова карта с `action` има и `title`. */
type CardProps = BaseCardProps &
  (
    | { title?: ReactNode; action?: undefined }
    | { title: ReactNode; action: ReactNode }
  );

export function Card({
  as: Element = 'section',
  title,
  aside,
  action,
  stale,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = ['card', interactive && 'card--interactive', className]
    .filter(Boolean)
    .join(' ');
  const heading = (
    <h2 className="card__title">
      {title}
      {aside !== undefined && <span className="card__aside">{aside}</span>}
    </h2>
  );
  return (
    <Element className={classes} {...rest}>
      {title !== undefined && action === undefined && heading}
      {title !== undefined && action !== undefined && (
        <div className="card__head">
          {heading}
          {action}
        </div>
      )}
      <div className="card__body">{children}</div>
      {stale !== undefined && <p className="card__stale">{stale}</p>}
    </Element>
  );
}
