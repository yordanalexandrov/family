import { vi } from 'vitest';

/** One file of a form the app sent: its field, file name, type and size. */
export interface SentFile {
  field: string;
  name: string;
  type: string;
  size: number;
}

/** A request whose body was a FormData: where it went, its Content-Type header as the app set it, and its files. */
export interface SentForm {
  url: string;
  contentType: string | null;
  files: SentFile[];
}

/**
 * Records the forms (`FormData` bodies) the app sends and lets each request go on without its body, for msw to answer.
 * Needed because jsdom's FormData holds jsdom's Blob, whose bytes Node's fetch cannot read, so msw never sees a
 * multipart body; the multipart parsing itself is the api's (its spec sends real forms).
 */
export function recordForms(): SentForm[] {
  const sent: SentForm[] = [];
  const fetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (!(init?.body instanceof FormData)) {
      return fetch(input, init);
    }
    const files: SentFile[] = [];
    for (const [field, value] of init.body.entries()) {
      if (typeof value !== 'string') {
        files.push({
          field,
          name: value.name,
          type: value.type,
          size: value.size,
        });
      }
    }
    sent.push({
      url: String(input),
      contentType: new Headers(init.headers).get('content-type'),
      files,
    });
    const { body: _form, ...rest } = init;
    return fetch(input, rest);
  });
  return sent;
}
