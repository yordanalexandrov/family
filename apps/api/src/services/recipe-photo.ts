import type { ImportPhotoType } from '@family/shared';

/**
 * The media type of a photo of an import, read from its first bytes rather than from what the phone says (a gallery
 * may send `application/octet-stream`, or nothing); `undefined` for anything that is not a JPEG, PNG, WebP or HEIC/HEIF
 * picture. Shared by the route and `scripts/import-smoke.ts`, so the smoke sends what the api would.
 */
export function photoType(bytes: Uint8Array): ImportPhotoType | undefined {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') {
    return 'image/png';
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  // ISO base media file: `ftyp` at 4, then the major brand.
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx'].includes(brand)) {
      return 'image/heic';
    }
    if (['mif1', 'msf1'].includes(brand)) {
      return 'image/heif';
    }
  }
  return undefined;
}
