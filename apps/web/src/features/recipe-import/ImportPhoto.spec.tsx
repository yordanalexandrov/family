import type { RecipeImportDetail, RecipeImportRequest } from '@family/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordForms } from '../../test/form-data';
import { importId, pendingImport } from '../../test/imports';
import { dani, server } from '../../test/msw';
import { renderApp, setUpDevice } from '../../test/render';

const WAITING = 'Чета рецептата… обикновено отнема до минута';

const photoImport: RecipeImportRequest = {
  id: importId,
  status: 'pending',
  source: 'photo',
  requestedBy: pendingImport.requestedBy,
  createdAt: pendingImport.createdAt,
};

/** The api of a photo import: `POST` answers with the pending import; returns the forms the screen sent. */
function servePhotoImport() {
  const forms = recordForms();
  server.use(
    http.get('/api/recipe-imports', () => HttpResponse.json({ requests: [] })),
    http.post('/api/recipe-imports', () =>
      HttpResponse.json({ request: photoImport }, { status: 202 }),
    ),
    http.get(`/api/recipe-imports/${importId}`, () =>
      HttpResponse.json({
        request: photoImport,
        ingredients: [],
      } satisfies RecipeImportDetail),
    ),
  );
  return { forms };
}

/** The browser's decoding and canvas, mocked: every photo decodes as `width`×`height` and encodes as a small JPEG. */
function mockCanvas(width: number, height: number) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(new Blob(['small jpeg'], { type: 'image/jpeg' })),
  );
}

beforeEach(() => {
  // jsdom has no object URLs; the preview only needs one.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openPhotoTab() {
  setUpDevice('phone', dani.id);
  renderApp('/recipes/import');
  await userEvent.click(await screen.findByRole('tab', { name: 'Снимка' }));
}

describe('Внеси рецепта → таб „Снимка“', () => {
  it('„Снимай“ отваря камерата, „Избери от галерията“ — галерията; и двата приемат само снимки', async () => {
    servePhotoImport();
    await openPhotoTab();

    const camera = screen.getByLabelText('Снимай');
    const gallery = screen.getByLabelText('Избери от галерията');
    expect(camera).toHaveAttribute('type', 'file');
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(gallery).toHaveAttribute('accept', 'image/*');
    expect(gallery).not.toHaveAttribute('capture');
  });

  it('избраната снимка се смалява, показва се за преглед и „Внеси“ я праща като JPEG в полето photo', async () => {
    mockCanvas(4032, 3024);
    const api = servePhotoImport();
    await openPhotoTab();

    expect(screen.getByRole('button', { name: 'Внеси' })).toBeDisabled();
    await userEvent.upload(
      screen.getByLabelText('Избери от галерията'),
      new File(['x'.repeat(5000)], 'IMG_0042.png', { type: 'image/png' }),
    );

    expect(
      await screen.findByRole('img', { name: 'Снимката за внасяне' }),
    ).toHaveAttribute('src', 'blob:preview');
    await userEvent.click(screen.getByRole('button', { name: 'Внеси' }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.forms).toEqual([
      {
        url: expect.stringMatching(/\/api\/recipe-imports$/),
        // Not JSON: the browser sets multipart/form-data with its boundary.
        contentType: null,
        files: [
          {
            field: 'photo',
            name: 'photo.jpg',
            type: 'image/jpeg',
            size: 'small jpeg'.length,
          },
        ],
      },
    ]);
  });

  it('дълъг скрийншот се реже на части: всички се показват и „Внеси“ ги праща поред в полето photo', async () => {
    mockCanvas(1170, 4000);
    const api = servePhotoImport();
    await openPhotoTab();

    await userEvent.upload(
      screen.getByLabelText('Избери от галерията'),
      new File(['x'.repeat(5000)], 'Screenshot.png', { type: 'image/png' }),
    );

    expect(
      await screen.findAllByRole('img', {
        name: /^Снимката за внасяне, част \d от 3$/,
      }),
    ).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Внеси' }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.forms[0]?.files.map((file) => file.field)).toEqual([
      'photo',
      'photo',
      'photo',
    ]);
  });

  it('снимка, която браузърът не декодира, отива както е; над 10 MB — съобщение и „Внеси“ остава изключен', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('cannot decode', 'InvalidStateError');
      }),
    );
    servePhotoImport();
    await openPhotoTab();

    const big = new File(['x'], 'IMG_0043.HEIC', { type: 'image/heic' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await userEvent.upload(screen.getByLabelText('Избери от галерията'), big);

    expect(
      await screen.findByText('Снимката е над 10 MB. Опитай с по-малка.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Внеси' })).toBeDisabled();
  });
});

/**
 * The Cache API as the service worker leaves it after „Сподели → Семейство“ with a photo (`receiveShare` in `shared-photo.ts`):
 * the photo under `/shared-photo` in the cache `family-share-target`. jsdom has no Cache API.
 */
function sharedPhotoCache(photo: Blob | undefined) {
  const stored = new Map<string, Blob>();
  if (photo) {
    stored.set('/shared-photo', photo);
  }
  const cache = {
    match: vi.fn(async (key: string) => {
      const blob = stored.get(key);
      return blob && { blob: async () => blob };
    }),
    delete: vi.fn(async (key: string) => stored.delete(key)),
  };
  vi.stubGlobal('caches', {
    open: vi.fn(async (name: string) => {
      expect(name).toBe('family-share-target');
      return cache;
    }),
  });
  return stored;
}

describe('Споделена снимка (share target с POST през service worker-а)', () => {
  it('`?shared=photo` взема снимката от кеша, смалява я и пуска едно внасяне; презареждане не пуска второ', async () => {
    mockCanvas(3000, 4000);
    setUpDevice('phone', dani.id);
    const api = servePhotoImport();
    const stored = sharedPhotoCache(
      new File(['x'.repeat(5000)], 'IMG_0044.jpg', { type: 'image/jpeg' }),
    );

    const first = renderApp('/recipes/import?shared=photo');

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(api.forms.map((form) => form.files)).toEqual([
      [
        {
          field: 'photo',
          name: 'photo.jpg',
          type: 'image/jpeg',
          size: 'small jpeg'.length,
        },
      ],
    ]);
    // The photo leaves the cache once it is taken.
    expect(stored.size).toBe(0);
    const reloaded = first.router.state.location.href;
    expect(reloaded).toBe(`/recipes/import/${importId}`);

    first.unmount();
    renderApp('/recipes/import?tab=photo');
    expect(await screen.findByRole('tab', { name: 'Снимка' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(api.forms).toHaveLength(1);
  });

  it('без снимка в кеша (напр. второ отваряне на същия адрес) остава табът „Снимка“, без внасяне', async () => {
    setUpDevice('phone', dani.id);
    const api = servePhotoImport();
    sharedPhotoCache(undefined);

    renderApp('/recipes/import?shared=photo');

    expect(await screen.findByRole('tab', { name: 'Снимка' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      await screen.findByLabelText('Избери от галерията'),
    ).toBeInTheDocument();
    expect(api.forms).toEqual([]);
  });
});

describe('Неуспешно внасяне от снимка', () => {
  it('няма „Опитай пак“ (снимката не е пазена), а „Нова снимка“ води към таба „Снимка“', async () => {
    setUpDevice('phone', dani.id);
    server.use(
      http.get('/api/recipe-imports', () =>
        HttpResponse.json({ requests: [] }),
      ),
      http.get(`/api/recipe-imports/${importId}`, () =>
        HttpResponse.json({
          request: {
            ...photoImport,
            status: 'failed',
            error: 'no_results',
            noResults: 'На снимката няма рецепта.',
          },
          ingredients: [],
        } satisfies RecipeImportDetail),
      ),
    );

    renderApp(`/recipes/import/${importId}`);

    expect(
      await screen.findByText('Не намерих рецепта: На снимката няма рецепта.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Опитай пак' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Нова снимка' }));
    expect(await screen.findByRole('tab', { name: 'Снимка' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
