import type { CalendarSource, PersonColor, User } from '@family/shared';
import { useUsers } from '../../api/queries';
import { Avatar, FAMILY_AVATAR } from '../../components/Avatar';

export interface SourceAvatar {
  id: string;
  initial: string;
  color: PersonColor;
}

/**
 * Аватарът на източник на календар: семейният е „С“ в семейния цвят; личният е
 * инициалът на собственика (от `/api/users`, иначе първата буква на името) в
 * цвета на източника.
 */
export function sourceAvatar(
  source: CalendarSource,
  users: User[] | undefined,
): SourceAvatar {
  if (source.kind === 'family' || source.colorToken === 'family') {
    return { id: source.id, ...FAMILY_AVATAR };
  }
  const owner = users?.find((user) => user.id === source.ownerUserId);
  return {
    id: source.id,
    initial: owner?.initial ?? source.name.charAt(0).toUpperCase(),
    color: source.colorToken,
  };
}

/** Цветовият токен на събитие: покана от няколко източника е в семейния цвят. */
export function eventColor(sources: CalendarSource[]): PersonColor {
  const [only] = sources;
  if (sources.length !== 1 || !only || only.colorToken === 'family') {
    return 'person-family';
  }
  return only.colorToken;
}

export function useSourceAvatars(sources: CalendarSource[]): SourceAvatar[] {
  const users = useUsers();
  return sources.map((source) => sourceAvatar(source, users.data));
}

/** По един аватар за всеки източник на събитието. */
export function SourceAvatars({ sources }: { sources: CalendarSource[] }) {
  const avatars = useSourceAvatars(sources);
  return (
    <span className="source-avatars">
      {avatars.map(({ id, initial, color }) => (
        <Avatar key={id} initial={initial} color={color} size="sm" />
      ))}
    </span>
  );
}
