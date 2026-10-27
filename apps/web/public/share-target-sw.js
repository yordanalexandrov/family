// „Сподели → Семейство“ на Android: share target-ът в manifest-а (vite.config.ts) е POST multipart/form-data към
// /recipes/import, затова го поема service worker-ът (Workbox го зарежда с importScripts) — сървърът няма такъв
// адрес. Споделена снимка остава в Cache API и екранът я взема оттам (src/features/recipe-import/shared-photo.ts,
// със същите две имена); текст и линк отиват в адреса като GET, както преди (`importFromShare`). Адресът без `tab`
// значи „пусни внасянето“; екранът го подменя с `?tab=…`, затова презареждане не внася втори път.
const SHARE_CACHE = 'family-share-target';
const SHARED_PHOTO_KEY = '/shared-photo';

async function receiveShare(request) {
  const form = await request.formData();
  const photo = form.get('photo');
  if (photo instanceof File && photo.size > 0) {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      SHARED_PHOTO_KEY,
      new Response(photo, {
        headers: { 'content-type': photo.type || 'application/octet-stream' },
      }),
    );
    return Response.redirect(
      new URL('/recipes/import?shared=photo', self.location.origin).href,
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
    new URL(`/recipes/import?${query}`, self.location.origin).href,
    303,
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname === '/recipes/import'
  ) {
    event.respondWith(receiveShare(event.request));
  }
});
