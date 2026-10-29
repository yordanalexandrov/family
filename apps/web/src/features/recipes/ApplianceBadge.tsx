import { applianceShortName } from '../appliances/queries';

/** Значка „🔌 air fryer“: рецептата (или предложението) е за наш уред (GLOSSARY: Уред); пълното име е в подсказката. */
export function ApplianceBadge({ name }: { name: string }) {
  return (
    <span className="badge" title={name}>
      🔌 {applianceShortName(name)}
    </span>
  );
}
