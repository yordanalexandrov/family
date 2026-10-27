import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitWithin, resizePhoto } from './resize-photo';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fitWithin', () => {
  it('scales the long side down to the limit and keeps the proportions', () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1500, 3000, 2000)).toEqual({ width: 1000, height: 2000 });
  });

  it('leaves a picture within the limit as it is', () => {
    expect(fitWithin(1280, 960, 2000)).toEqual({ width: 1280, height: 960 });
  });
});

/** The browser's decoding and canvas, mocked: a decoded picture of `width`×`height`, and what was drawn. */
function mockCanvas(width: number, height: number) {
  const drawn: { width: number; height: number }[] = [];
  const encoded: { type?: string; quality?: unknown }[] = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        drawImage: () => drawn.push({ width: this.width, height: this.height }),
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

    const resized = await resizePhoto(photo);

    expect(resized.type).toBe('image/jpeg');
    expect(canvas.drawn).toEqual([{ width: 2000, height: 1500 }]);
    expect(canvas.encoded).toEqual([{ type: 'image/jpeg', quality: 0.85 }]);
  });

  it('sends a picture the browser cannot decode (HEIC outside Safari) as it is', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('cannot decode', 'InvalidStateError');
      }),
    );
    const heic = new File(['heic'], 'IMG_2.HEIC', { type: 'image/heic' });

    expect(await resizePhoto(heic)).toBe(heic);
  });
});
