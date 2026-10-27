import { describe, expect, it } from 'vitest';
import { importPhotoLayout } from './import-photo.js';

describe('importPhotoLayout', () => {
  it('makes a photo at most 2000 px on the long side, in one part', () => {
    expect(importPhotoLayout(4032, 3024)).toEqual({
      width: 2000,
      height: 1500,
      tiles: [{ top: 0, height: 1500 }],
    });
    expect(importPhotoLayout(1500, 3000)).toEqual({
      width: 1000,
      height: 2000,
      tiles: [{ top: 0, height: 2000 }],
    });
  });

  it('leaves a picture within the limit as it is', () => {
    expect(importPhotoLayout(1280, 960)).toEqual({
      width: 1280,
      height: 960,
      tiles: [{ top: 0, height: 960 }],
    });
  });

  it('cuts a long screenshot into even parts of at most 2000 px that overlap by 80 px, keeping its width readable', () => {
    expect(importPhotoLayout(1170, 4000)).toEqual({
      width: 1170,
      height: 4000,
      tiles: [
        { top: 0, height: 1387 },
        { top: 1307, height: 1387 },
        { top: 2614, height: 1386 },
      ],
    });
    expect(importPhotoLayout(2400, 6000)).toEqual({
      width: 1200,
      height: 3000,
      tiles: [
        { top: 0, height: 1540 },
        { top: 1460, height: 1540 },
      ],
    });
  });

  it('makes a screenshot that would need more than 8 parts narrower, so that it fits in 8', () => {
    const layout = importPhotoLayout(1170, 18000);

    expect(layout).toMatchObject({ width: 1004, height: 15440 });
    expect(layout.tiles).toHaveLength(8);
    expect(layout.tiles[0]).toEqual({ top: 0, height: 2000 });
    expect(layout.tiles[7]).toEqual({ top: 13440, height: 2000 });
  });

  it('keeps a narrow, not so long picture in one part', () => {
    expect(importPhotoLayout(300, 1000)).toEqual({
      width: 300,
      height: 1000,
      tiles: [{ top: 0, height: 1000 }],
    });
  });
});
