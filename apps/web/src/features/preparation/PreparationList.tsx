import type { Preparation } from '@family/shared';
import { PreparationItemLabel } from './PreparationItemLabel';
import './preparation.css';

/** Подготовката само за четене, в реда на рецептата: изгледът на рецептата и сравнението в „Подобри рецептата“. */
export function PreparationList({
  preparation,
  ...name
}: {
  preparation: Preparation;
} & (
  | {
      /** `id` на заглавието, което дава името на списъка. */
      labelledBy: string;
    }
  | {
      /** Името на списъка, когато няма заглавие за него. */
      label: string;
    }
)) {
  return (
    <ul
      className="preparation-list"
      {...('labelledBy' in name
        ? { 'aria-labelledby': name.labelledBy }
        : { 'aria-label': name.label })}
    >
      {preparation.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: елементите нямат id, а редът им е смисълът.
        <li key={index} className="preparation-item">
          <PreparationItemLabel item={item} />
        </li>
      ))}
    </ul>
  );
}
