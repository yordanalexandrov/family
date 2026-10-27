import type { MenuNotifications } from './menu-notifications.js';

/** The cron's `reminders` job (`plugins/scheduler.ts`, every 5 minutes); created once in `buildApp()` as `app.reminders`. */
export interface Reminders {
  /** Sends what is due now. Rejects only when the database does. */
  run(): Promise<void>;
}

export function createReminders({
  menuNotifications,
}: {
  menuNotifications: MenuNotifications;
}): Reminders {
  return {
    async run() {
      await menuNotifications.sendQuietActivity();
    },
  };
}
