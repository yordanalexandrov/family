/** Пътища, които не са страници на приложението: api-то, healthz и Cloudflare Access (`/cdn-cgi/`). */
export const NAVIGATION_DENYLIST: RegExp[] = [
  /^\/api\//,
  /^\/healthz/,
  /^\/cdn-cgi\//,
];

/** Дали навигация към този път (с query) се отговаря от service worker-а с index.html. */
export function isAppNavigation(pathWithSearch: string): boolean {
  return !NAVIGATION_DENYLIST.some((pattern) => pattern.test(pathWithSearch));
}
