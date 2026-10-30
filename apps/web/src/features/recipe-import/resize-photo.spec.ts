import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizePhoto, resizeStepPhoto } from './resize-photo';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The browser's decoding and canvas, mocked: a decoded picture of `width`×`height`, and what was drawn. */
function mockCanvas(width: number, height: number) {
  const drawn: { width: number; height: number; top: number }[] = [];
  const encoded: { type?: string; quality?: unknown }[] = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        drawImage: (_image: unknown, _x: number, y: number) =>
          drawn.push({ width: this.width, height: this.height, top: -y }),
      } as unknown as CanvasRenderingContext2D;
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback, type, quality) => {
      encoded.push({ type, quality });
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    },
  );
  return { drawn, encoded };
}

describe('resizePhoto', () => {
  it('draws the photo at most 2000 px on the long side and sends it as JPEG', async () => {
    const canvas = mockCanvas(4032, 3024);
    const photo = new File(['x'.repeat(100)], 'IMG_1.png', {
      type: 'image/png',
    });

    const parts = await resizePhoto(photo);

    expect(parts.map((part) => part.type)).toEqual(['image/jpeg']);
    expect(canvas.drawn).toEqual([{ width: 2000, height: 1500, top: 0 }]);
    expect(canvas.encoded).toEqual([{ type: 'image/jpeg', quality: 0.85 }]);
  });

  it('cuts a long screenshot into readable parts, top to bottom', async () => {
    const canvas = mockCanvas(1170, 4000);
    const screenshot = new File(['x'], 'Screenshot.png', { type: 'image/png' });

    const parts = await resizePhoto(screenshot);

    expect(parts).toHaveLength(3);
    expect(canvas.drawn).toEqual([
      { width: 1170, height: 1387, top: 0 },
      { width: 1170, height: 1387, top: 1307 },
      { width: 1170, height: 1386, top: 2614 },
    ]);
  });

  it('sends a picture the browser cannot decode (HEIC outside Safari) as it is', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('cannot decode', 'InvalidStateError');
      }),
    );
    const heic = new File(['heic'], 'IMG_2.HEIC', { type: 'image/heic' });

    expect(await resizePhoto(heic)).toEqual([heic]);
  });
});

describe('resizeStepPhoto', () => {
  it('draws the photo at most 2000 px on the long side as one JPEG', async () => {
    const canvas = mockCanvas(3024, 4032);

    const photo = await resizeStepPhoto(
      new File(['x'], 'IMG_2.jpg', { type: 'image/jpeg' }),
    );

    expect(photo.type).toBe('image/jpeg');
    expect(canvas.drawn).toEqual([{ width: 1500, height: 2000, top: 0 }]);
    expect(canvas.encoded).toEqual([{ type: 'image/jpeg', quality: 0.85 }]);
  });

  it('keeps a long screenshot whole, never in parts', async () => {
    const canvas = mockCanvas(1170, 4000);

    await resizeStepPhoto(new File(['x'], 'Screenshot.png'));

    expect(canvas.drawn).toEqual([{ width: 585, height: 2000, top: 0 }]);
  });

  it('sends a photo the browser cannot decode as it is', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('no HEIC here', 'InvalidStateError');
      }),
    );
    const heic = new File(['heic'], 'IMG_3.HEIC', { type: 'image/heic' });

    expect(await resizeStepPhoto(heic)).toBe(heic);
  });
});
