/** `heic-decode` ships no types: the images of a HEIC/HEIF file as RGBA pixels (libheif in WebAssembly). */
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  /** An image of the file by its declared size, not decoded until `decode()`. */
  interface HeifImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }

  /** Every image of the file; `dispose()` frees them once done. */
  type HeifImages = HeifImage[] & { dispose(): void };

  interface Decode {
    (options: { buffer: Uint8Array }): Promise<DecodedImage>;
    all(options: { buffer: Uint8Array }): Promise<HeifImages>;
  }

  const decode: Decode;
  export default decode;
}
