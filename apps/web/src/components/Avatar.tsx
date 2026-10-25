import type { PersonColor } from '@family/shared';
import type { CSSProperties } from 'react';
import './Avatar.css';

interface AvatarProps {
  initial: string;
  /** Цветовият токен на човека, вече валидиран от schema-та в shared: `person-1` → `--color-person-1`. */
  color: PersonColor;
  size?: 'md' | 'lg';
}

// Токен без стойност в tokens.css пада на --color-accent (Avatar.css).
export function Avatar({ initial, color, size = 'md' }: AvatarProps) {
  const style = { '--avatar-color': `var(--color-${color})` } as CSSProperties;
  return (
    <span className={`avatar avatar--${size}`} style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
