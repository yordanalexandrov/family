import { afterEach, describe, expect, it, vi } from 'vitest';
import { isShareTarget, receiveShare } from './shared-photo';

const ORIGIN = 'https://family.example';

/**
 * The share target's POST as the service worker sees it. Only the parts `receiveShare` reads: jsdom's `File` does not
 * go into Node's `FormData`/`Request` body, so the form is handed over as is.
 */
function share(
  fields: Record<string, string | File>,
  origin = ORIGIN,
): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return {
    method: 'POST',
    url: `${origin}/recipes/import`,
    formData: async () => form,
  } as unknown as Request;
}

function stubCache() {
  const put = vi.fn(async (_key: string, _response: Response) => {});
  vi.stubGlobal('caches', {
    open: vi.fn(async (name: string) => {
      expect(name).toBe('family-share-target');
      return { put };
    }),
  });
  return put;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isShareTarget', () => {
  it('само POST към /recipes/import от същия адрес', () => {
    expect(isShareTarget(share({ text: 'x' }), ORIGIN)).toBe(true);
    expect(isShareTarget(new Request(`${ORIGIN}/recipes/import`), ORIGIN)).toBe(
      false,
    );
    expect(
      isShareTarget(share({ text: 'x' }, 'https://other.example'), ORIGIN),
    ).toBe(false);
  });
});

describe('receiveShare', () => {
  it('снимка → в кеша и 303 към ?shared=photo', async () => {
    const put = stubCache();
    const photo = new File(['jpeg'], 'IMG_0044.jpg', { type: 'image/jpeg' });

    const response = await receiveShare(share({ photo }), ORIGIN);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/recipes/import?shared=photo`,
    );
    expect(put).toHaveBeenCalledExactlyOnceWith(
      '/shared-photo',
      expect.any(Response),
    );
    expect(put.mock.calls[0]?.[1].headers.get('content-type')).toBe(
      'image/jpeg',
    );
  });

  it('текст и линк → 303 към стария GET адрес, без празните полета', async () => {
    const put = stubCache();

    const response = await receiveShare(
      share({ title: 'Тиквеник', text: '  ', url: 'https://x.example/r' }),
      ORIGIN,
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/recipes/import');
    expect([...location.searchParams]).toEqual([
      ['title', 'Тиквеник'],
      ['url', 'https://x.example/r'],
    ]);
    expect(put).not.toHaveBeenCalled();
  });
});
