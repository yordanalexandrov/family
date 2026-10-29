import { nonEmptyLines, type RecipeImportRequest } from '@family/shared';
import { failureMessage } from '../../lib/ai-requests';
import { shorten, sourceDomain } from '../recipes/format';

const SOURCE_LABELS: Record<RecipeImportRequest['source'], string> = {
  text: 'Текст',
  url: 'Линк',
  photo: 'Снимка',
};

/**
 * Как се казва внасянето в списъка: заглавието на предложението, а докато го няма — първият ред на текста (до ~40
 * знака) или домейнът на линка; само при снимка видът на източника.
 */
export function importLabel(request: RecipeImportRequest): string {
  if (request.title) {
    return request.title;
  }
  if (request.firstLine) {
    return shorten(request.firstLine);
  }
  if (request.source === 'url' && request.url) {
    return sourceDomain(request.url);
  }
  return SOURCE_LABELS[request.source];
}

/** Съобщението за неуспешно внасяне: при `no_results` причината на агента, иначе общото съобщение. */
export function importFailureMessage(request: RecipeImportRequest): string {
  if (request.error === 'no_results' && request.noResults) {
    return `Не намерих рецепта: ${request.noResults}`;
  }
  return failureMessage('import', request);
}

/** Първите 2 непразни реда на поставения текст, всеки отрязан до ~60 знака. */
export function textLead(text: string): string {
  return nonEmptyLines(text)
    .slice(0, 2)
    .map((line) => shorten(line, 60))
    .join('\n');
}
