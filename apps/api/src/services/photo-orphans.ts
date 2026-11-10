import { DAY_MS, HOUR_MS, startOfDayInSofia } from '@family/shared';

/** The night hours in Sofia when the cron removes orphan photos: an edit given up in the evening loses nothing till morning. */
const ORPHAN_CLEANUP_HOURS = { from: 3, to: 5 };

/**
 * A photo is stored before anything points at it (a step photo on choosing it, a source photo before its import is
 * stored), so a younger orphan may be an edit or an import under way.
 */
const ORPHAN_MIN_AGE_MS = DAY_MS;

/**
 * When the cron removes orphan photos (step photos, `step-photos.ts`; source photos, `source-photos.ts`): at night in
 * Sofia ({@link ORPHAN_CLEANUP_HOURS}) the time before which an orphan is old enough to go; by day `null`.
 */
export function orphanPhotosBefore(now: Date): Date | null {
  const hour = (now.getTime() - startOfDayInSofia(now).getTime()) / HOUR_MS;
  if (hour < ORPHAN_CLEANUP_HOURS.from || hour >= ORPHAN_CLEANUP_HOURS.to) {
    return null;
  }
  return new Date(now.getTime() - ORPHAN_MIN_AGE_MS);
}
