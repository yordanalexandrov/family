/**
 * A photo shared to the app („Сподели → Семейство“). The share target in the manifest (vite.config.ts) is a `POST`
 * multipart/form-data to `/recipes/import`, which the server does not have: the service worker (`src/sw.ts`) hands it to
 * `receiveShare`, which leaves the photo in the Cache API and opens `/recipes/import?shared=photo`; the screen takes it
 * with `takeSharedPhoto`. Text and link go to the address as a GET, as before (`importFromShare`). The address without
 * `tab` means „start the import“; the screen replaces it with `?tab=…`, so a reload does not import a second time.
 */
const SHARE_CACHE = 'family-share-target';
const SHARED_PHOTO_KEY = '/shared-photo';
const IMPORT_PATH = '/recipes/import';

/** Whether a request the service worker sees is the share target's `POST`. */
export function isShareTarget(request: Request, origin: string): boolean {
  const url = new URL(request.url);
  return (
    request.method === 'POST' &&
    url.origin === origin &&
    url.pathname === IMPORT_PATH
  );
}

/** The share target's `POST`, answered by the service worker: a 303 to the import screen. */
export async function receiveShare(
  request: Request,
  origin: string,
): Promise<Response> {
  const form = await request.formData();
  const photo = form.get('photo');
  if (photo instanceof Blob && photo.size > 0) {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      SHARED_PHOTO_KEY,
      new Response(photo, {
        headers: { 'content-type': photo.type || 'application/octet-stream' },
      }),
    );
    return Response.redirect(
      new URL(`${IMPORT_PATH}?shared=photo`, origin).href,
      303,
    );
  }
  const query = new URLSearchParams();
  for (const key of ['title', 'text', 'url']) {
    const value = form.get(key);
    if (typeof value === 'string' && value.trim() !== '') {
      query.set(key, value);
    }
  }
  return Response.redirect(
    new URL(`${IMPORT_PATH}?${query}`, origin).href,
    303,
  );
}

/** The shared photo, taken out of the cache (so a reload does not import it again); `null` when there is none. */
export async function takeSharedPhoto(): Promise<Blob | null> {
  if (typeof caches === 'undefined') {
    return null;
  }
  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(SHARED_PHOTO_KEY);
  if (!response) {
    return null;
  }
  const photo = await response.blob();
  await cache.delete(SHARED_PHOTO_KEY);
  return photo;
}
