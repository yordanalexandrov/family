/**
 * How a photo of an import is made smaller before it is sent (the screen's `resize-photo.ts` and the api's
 * `import:smoke`): at most this many pixels on the long side, re-encoded as JPEG of this quality (0–1).
 */
export const IMPORT_PHOTO_MAX_SIDE = 2000;
export const IMPORT_PHOTO_JPEG_QUALITY = 0.85;

/** Most parts a long screenshot is cut into: OpenClaw takes at most 8 images. */
export const IMPORT_PHOTO_MAX_PARTS = 8;

/** A picture taller than this many times its width is a long (scrolling) screenshot. */
const TALL_RATIO = 2.2;
/** The width of a long screenshot at most: its text stays readable. */
const TALL_MAX_WIDTH = 1200;
/** How much two parts of a long screenshot share, so a line cut in two is whole in one of them. */
const PART_OVERLAP = 80;

/** One part of a picture: its rows `top`…`top + height` of the made-smaller picture. */
export interface ImportPhotoTile {
  top: number;
  height: number;
}

/** The size to draw a picture at, and the parts it is sent in, from top to bottom. */
export interface ImportPhotoLayout {
  width: number;
  height: number;
  tiles: ImportPhotoTile[];
}

function scaled(width: number, height: number, scale: number) {
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * How a picture of `width`×`height` goes to the agent. A photo: made smaller to at most 2000 px on the long side, in
 * one part. A long screenshot (taller than 2.2 × its width): at most 1200 px wide, cut into even parts of at most
 * 2000 px that overlap by 80 px; one that would need more than 8 parts is made narrower until 8 are enough. Shrinking
 * all of it to 2000 px would leave its text a few pixels high.
 */
export function importPhotoLayout(
  width: number,
  height: number,
): ImportPhotoLayout {
  if (height / width <= TALL_RATIO) {
    const size = scaled(
      width,
      height,
      Math.min(1, IMPORT_PHOTO_MAX_SIDE / Math.max(width, height)),
    );
    return { ...size, tiles: [{ top: 0, height: size.height }] };
  }
  const maxHeight =
    IMPORT_PHOTO_MAX_PARTS * IMPORT_PHOTO_MAX_SIDE -
    (IMPORT_PHOTO_MAX_PARTS - 1) * PART_OVERLAP;
  const size = scaled(
    width,
    height,
    Math.min(1, TALL_MAX_WIDTH / width, maxHeight / height),
  );
  const count = Math.max(
    1,
    Math.ceil(
      (size.height - PART_OVERLAP) / (IMPORT_PHOTO_MAX_SIDE - PART_OVERLAP),
    ),
  );
  const partHeight = Math.ceil(
    (size.height + (count - 1) * PART_OVERLAP) / count,
  );
  const tiles = Array.from({ length: count }, (_, index) => {
    const top = index * (partHeight - PART_OVERLAP);
    return { top, height: Math.min(partHeight, size.height - top) };
  });
  return { ...size, tiles };
}
