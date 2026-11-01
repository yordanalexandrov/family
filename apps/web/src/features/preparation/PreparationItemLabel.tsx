import {
  type PreparationItem,
  type PreparationKind,
  preparationKind,
  preparationLabel,
} from '@family/shared';

/** Иконата на вида; името на вида е името ѝ за четците на екрана. */
export function PreparationKindIcon({ kind }: { kind: PreparationKind }) {
  const { icon, labelBg } = preparationKind(kind);
  return (
    <span className="preparation-item__icon" role="img" aria-label={labelBg}>
      {icon}
    </span>
  );
}

/**
 * Иконата на вида и надписът на един елемент от подготовката (GLOSSARY: Подготовка): „🔥 200° · с вентилатор“. Общ за
 * изгледа на рецептата и чиповете в Готвене.
 */
export function PreparationItemLabel({ item }: { item: PreparationItem }) {
  return (
    <>
      <PreparationKindIcon kind={item.kind} />
      <span className="preparation-item__label">{preparationLabel(item)}</span>
    </>
  );
}
