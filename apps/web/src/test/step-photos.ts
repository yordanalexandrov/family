import { HttpResponse, http } from 'msw';
import { onTestFinished, vi } from 'vitest';
import { recordForms, type SentForm } from './form-data';
import { server } from './msw';

/** Ids of stored step photos, as `POST /api/step-photos` answers them in turn. */
export const stepPhotoIds = [
  'eeeeeeee-1111-4000-8000-000000000001',
  'eeeeeeee-1111-4000-8000-000000000002',
  'eeeeeeee-1111-4000-8000-000000000003',
] as const;

/** A photo as the phone's camera or gallery gives it to the file input. */
export function cameraPhoto(name = 'IMG_0001.jpg'): File {
  return new File(['camera bytes'], name, { type: 'image/jpeg' });
}

/**
 * The api of step photos for a web spec: each `POST /api/step-photos` answers the next of `stepPhotoIds`, and the
 * browser's decoding and canvas are mocked (every photo decodes as 4032×3024 and encodes as a small JPEG). Returns the
 * forms the screen sent (`recordForms`), in order.
 */
export function serveStepPhotoUploads(): SentForm[] {
  const forms = recordForms();
  let next = 0;
  server.use(
    http.post('/api/step-photos', () => {
      const id = stepPhotoIds[next++];
      return HttpResponse.json({ photo: { id } }, { status: 201 });
    }),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4032, height: 3024, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(new Blob(['small jpeg'], { type: 'image/jpeg' })),
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  return forms;
}
