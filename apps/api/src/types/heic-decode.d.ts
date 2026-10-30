/** `heic-decode` ships no types: the main image of a HEIC/HEIF file as RGBA pixels (libheif in WebAssembly). */
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  function decode(options: { buffer: Uint8Array }): Promise<DecodedImage>;

  export default decode;
}
