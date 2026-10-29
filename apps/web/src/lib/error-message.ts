/** Текстът за toast при неуспешна заявка: съобщението на грешката (`ApiError` носи това от api-то), иначе общо. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Нещо се обърка';
}
