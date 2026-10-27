/**
 * Where the service worker leaves a photo shared to the app („Сподели → Семейство“): `public/share-target-sw.js` takes
 * the `POST` of the share target, puts the photo here and opens `/recipes/import?shared=photo`. The same two names are
 * written there (plain JS, outside the bundle).
 */
const SHARE_CACHE = 'family-share-target';
const SHARED_PHOTO_KEY = '/shared-photo';

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
