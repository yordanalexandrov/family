import type { CSSProperties } from 'react';
import './Avatar.css';

interface AvatarProps {
  initial: string;
  /** Суфикс на цветов токен от api, напр. `person-1` → `--color-person-1`. */
  color: string;
  size?: 'md' | 'lg';
}

const TOKEN_SUFFIX = /^[a-z0-9-]+$/;

export function Avatar({ initial, color, size = 'md' }: AvatarProps) {
  const token = TOKEN_SUFFIX.test(color) ? color : 'accent';
  const style = { '--avatar-color': `var(--color-${token})` } as CSSProperties;
  return (
    <span className={`avatar avatar--${size}`} style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
