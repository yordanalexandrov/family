import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

/*
 * Стъклена карта (GLOSSARY: карта): фон, 1px контур, вътрешен отблясък.
 * Слотове: заглавие (`title`, по желание с `aside` вдясно), тяло (`children`) и
 * жълт надпис за остарели данни (`stale`). `interactive` дава фокус-рамка и
 * натискане. Карта-връзка е `as="a"` с `href`; `button` не е позволен, защото
 * заглавието (h2) и тялото (div) не са валидно съдържание на бутон.
 */
type CardElement = 'section' | 'article' | 'div' | 'li' | 'a';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: CardElement;
  title?: ReactNode;
  aside?: ReactNode;
  stale?: ReactNode;
  interactive?: boolean;
  href?: string;
}

export function Card({
  as: Element = 'section',
  title,
  aside,
  stale,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = ['card', interactive && 'card--interactive', className]
    .filter(Boolean)
    .join(' ');
  return (
    <Element className={classes} {...rest}>
      {title !== undefined && (
        <h2 className="card__title">
          {title}
          {aside !== undefined && <span className="card__aside">{aside}</span>}
        </h2>
      )}
      <div className="card__body">{children}</div>
      {stale !== undefined && <p className="card__stale">{stale}</p>}
    </Element>
  );
}
