import type { Preparation } from '@family/shared';
import { PreparationItemLabel } from './PreparationItemLabel';
import './preparation.css';

/** Подготовката само за четене, в реда на рецептата: изгледът на рецептата. */
export function PreparationList({
  preparation,
  labelledBy,
}: {
  preparation: Preparation;
  /** `id` на заглавието, което дава името на списъка. */
  labelledBy: string;
}) {
  return (
    <ul className="preparation-list" aria-labelledby={labelledBy}>
      {preparation.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: елементите нямат id, а редът им е смисълът.
        <li key={index} className="preparation-item">
          <PreparationItemLabel item={item} />
        </li>
      ))}
    </ul>
  );
}
