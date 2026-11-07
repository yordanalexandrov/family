import { describe, expect, it } from 'vitest';
import { isAppNavigation } from './navigation-route';

/*
 * Service worker-ът отговаря с index.html на навигациите към приложението. Пътищата на сървъра и на Cloudflare Access
 * (`/cdn-cgi/access/authorized` при вход в друг hostname на същото Access приложение, `/cdn-cgi/access/logout`)
 * трябва да стигнат до мрежата, иначе router-ът показва „Няма такава страница“.
 */
describe('isAppNavigation', () => {
  it.each(['/', '/recipes', '/recipes/abc/edit', '/menu?week=2026-W45'])(
    '%s е страница на приложението',
    (path) => {
      expect(isAppNavigation(path)).toBe(true);
    },
  );

  it.each([
    '/api/recipes',
    '/healthz',
    '/cdn-cgi/access/authorized?nonce=x&state=y',
    '/cdn-cgi/access/logout',
  ])('%s отива към мрежата', (path) => {
    expect(isAppNavigation(path)).toBe(false);
  });
});
