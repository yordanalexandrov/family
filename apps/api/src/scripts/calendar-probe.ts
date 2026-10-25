/**
 * Manual smoke test against the real Google Calendar (`pnpm --filter api calendar:probe`), after provisioning:
 * reads the sync window of every calendar in GOOGLE_CALENDARS with GOOGLE_SERVICE_ACCOUNT_JSON and prints how
 * many events each has. Writes nothing to the database.
 */
import { FAMILY_TIME_ZONE } from '@family/shared';
import { loadConfig } from '../config.js';
import { createCalendarClient } from '../integrations/google-calendar/client.js';
import { syncWindow } from '../services/calendar-sync.js';

function print(line: string) {
  process.stdout.write(`${line}\n`);
}

const { googleCalendar } = loadConfig();
if (!googleCalendar) {
  print(
    'calendar sync: unconfigured (GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDARS)',
  );
  process.exit(1);
}

const client = createCalendarClient(googleCalendar.serviceAccountJson);
const window = syncWindow(new Date());
print(`window: ${window.from.toISOString()} .. ${window.to.toISOString()}`);

let failed = false;
for (const calendar of googleCalendar.calendars) {
  try {
    const events = await client.listEvents(
      calendar.googleCalendarId,
      window.from,
      window.to,
      FAMILY_TIME_ZONE,
    );
    print(`${calendar.name}: ${events.length} events`);
  } catch (error) {
    failed = true;
    print(
      `${calendar.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
process.exit(failed ? 1 : 0);
