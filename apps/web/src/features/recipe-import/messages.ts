import type { RecipeImportRequest } from '@family/shared';
import { failureMessage } from '../../lib/ai-requests';

const SOURCE_LABELS: Record<RecipeImportRequest['source'], string> = {
  text: 'Текст',
  url: 'Линк',
  photo: 'Снимка',
};

/** Как се казва внасянето в списъка: заглавието на предложението, а докато го няма — видът на източника. */
export function importLabel(request: RecipeImportRequest): string {
  return request.title ?? SOURCE_LABELS[request.source];
}

/** Съобщението за неуспешно внасяне: при `no_results` причината на агента, иначе по кода. */
export function importFailureMessage(request: RecipeImportRequest): string {
  if (request.error === 'no_results') {
    return request.noResults
      ? `Не намерих рецепта: ${request.noResults}`
      : 'Не намерих рецепта в източника.';
  }
  return failureMessage(request.error);
}
