import type { PersonColor } from '@family/shared';
import type { CSSProperties } from 'react';
import './Avatar.css';

interface AvatarProps {
  initial: string;
  /** Цветовият токен на човека, вече валидиран от schema-та в shared: `person-1` → `--color-person-1`. */
  color: PersonColor;
  size?: 'sm' | 'md' | 'lg';
}

/** Семейният календар няма човек: аватарът е „С“ в семейния цвят. */
export const FAMILY_AVATAR = {
  initial: 'С',
  color: 'person-family',
} as const satisfies Pick<AvatarProps, 'initial' | 'color'>;

// Токен без стойност в tokens.css пада на --color-accent (Avatar.css).
export function Avatar({ initial, color, size = 'md' }: AvatarProps) {
  const style = { '--avatar-color': `var(--color-${color})` } as CSSProperties;
  return (
    <span className={`avatar avatar--${size}`} style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
