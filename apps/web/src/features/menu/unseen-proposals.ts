import type { DateKey } from '@family/shared';
import { isCancelledError, type QueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { useActingUser } from '../../app/acting-user';
import { storedSetting } from '../../app/stored-setting';
import { logger } from '../../logger';
import { weekProposalQuery } from './queries';

export const UNSEEN_PROPOSALS_KEY = 'family.menu.unseenProposals';

type Weeks = readonly DateKey[];

const NONE: Weeks = [];

type UnseenWeeks = ReturnType<typeof storedSetting<Weeks>>;

const byPerson = new Map<string, UnseenWeeks>();

/**
 * Седмиците с готово предложение, което `actingUserId` още не е отворил, подредени (на устройството, отделно за
 * всеки човек: на споделено устройство единият не вижда точката на другия). Без действащ човек (kiosk) са на
 * устройството. Еднакъв запис дава същия масив, както иска `useSyncExternalStore`.
 */
function unseenOf(actingUserId: string | null): UnseenWeeks {
  const key = actingUserId
    ? `${UNSEEN_PROPOSALS_KEY}.${actingUserId}`
    : UNSEEN_PROPOSALS_KEY;
  let setting = byPerson.get(key);
  if (!setting) {
    let last: { raw: string | null; weeks: Weeks } = { raw: null, weeks: NONE };
    setting = storedSetting<Weeks>({
      key,
      parse: (raw) => {
        if (raw !== last.raw) {
          last = { raw, weeks: raw ? raw.split(',') : NONE };
        }
        return last.weeks;
      },
      unset: NONE,
      format: (weeks) => weeks.join(','),
    });
    byPerson.set(key, setting);
  }
  return setting;
}

function write(setting: UnseenWeeks, weeks: Weeks): void {
  setting.write(weeks.length === 0 ? NONE : weeks);
}

/**
 * По сигнала `menu.proposal.changed`: последното предложение на седмицата, ако е готово и не е поискано от
 * действащия човек (на другия или на крона), става невидяно за него.
 */
export async function noteProposalChange(
  queryClient: QueryClient,
  weekStart: DateKey,
  actingUserId: string | null,
): Promise<void> {
  try {
    const proposal = await queryClient.fetchQuery(weekProposalQuery(weekStart));
    if (proposal?.status !== 'done' || proposal.requestedBy === actingUserId) {
      return;
    }
    const unseen = unseenOf(actingUserId);
    const known = unseen.read();
    if (!known.includes(weekStart)) {
      write(unseen, [...known, weekStart].sort());
    }
  } catch (error) {
    // Отменено от по-новото четене на седмицата (обикновено следващият сигнал, който проверява пак).
    if (isCancelledError(error)) {
      return;
    }
    logger.warn('Предложението на седмицата не се прочете', error);
  }
}

function useUnseenWeeks(): { unseen: UnseenWeeks; weeks: Weeks } {
  const unseen = unseenOf(useActingUser().actingUserId);
  return {
    unseen,
    weeks: useSyncExternalStore(unseen.subscribe, unseen.read),
  };
}

/** Най-ранната седмица с невидяно за действащия човек предложение, или `undefined`. */
export function useUnseenProposalWeek(): DateKey | undefined {
  return useUnseenWeeks().weeks[0];
}

/** Отворената седмица е видяна от действащия човек: и предложението, дошло, докато е отворена. */
export function useSeeWeek(weekStart: DateKey): void {
  const { unseen, weeks } = useUnseenWeeks();
  useEffect(() => {
    if (weeks.includes(weekStart)) {
      write(
        unseen,
        weeks.filter((week) => week !== weekStart),
      );
    }
  }, [unseen, weeks, weekStart]);
}
