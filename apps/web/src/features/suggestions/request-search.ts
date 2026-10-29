/**
 * Search на `/recipes/suggest/:requestId`: решението, току-що взето в прегледа, за toast-а след връщането тук.
 * `rejected` е id-то на отхвърленото предложение (за „Върни“), `approved` — id-то на новата рецепта (за „Отвори“).
 */
export interface RequestSearch {
  rejected?: string;
  approved?: string;
}

/** Невалидният параметър става изрично `undefined` (виж `parseImportSearch`). */
export function parseRequestSearch(
  search: Record<string, unknown>,
): RequestSearch {
  return {
    rejected: searchId(search.rejected),
    approved: searchId(search.approved),
  };
}

/** Id от search-а: непразен низ, иначе `undefined`. */
export function searchId(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
