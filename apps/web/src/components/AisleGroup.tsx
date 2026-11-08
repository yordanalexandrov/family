import { AISLES, type Aisle } from '@family/shared';
import type { CSSProperties, ReactNode } from 'react';
import './AisleGroup.css';

const AISLE_LABELS = Object.fromEntries(
  AISLES.map(({ key, labelBg }) => [key, labelBg]),
) as Record<Aisle, string>;

/** Общата кутия на щандовете: редици с линия помежду си (#307). */
export function AisleGroups({ children }: { children: ReactNode }) {
  return <div className="aisle-groups">{children}</div>;
}

/**
 * Един щанд (#308): тънка лента вляво в цвета му, с етикета отдолу нагоре, и редовете вдясно.
 * Списъкът за пазаруване и продуктите на рецептата изглеждат еднакво.
 */
export function AisleGroup({
  aisle,
  headingLevel = 2,
  headingId,
  children,
}: {
  aisle: Aisle;
  /** `h2` в списъка за пазаруване, `h3` в „Купени“ и в рецептата. */
  headingLevel?: 2 | 3;
  /** За `aria-labelledby` на списъка с редовете. */
  headingId?: string;
  children: ReactNode;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      className="aisle-group"
      aria-label={AISLE_LABELS[aisle]}
      style={aisleColor(aisle)}
    >
      <div className="aisle-group__band">
        <Heading id={headingId} className="aisle-group__title">
          {AISLE_LABELS[aisle]}
        </Heading>
      </div>
      {children}
    </section>
  );
}

/** Цветът на щанда (`--color-aisle-<щанд>` в tokens.css) за лентата му. */
function aisleColor(aisle: Aisle): CSSProperties {
  return { '--aisle-color': `var(--color-aisle-${aisle})` } as CSSProperties;
}
