import type { Meal, MealOutcome, User, VoteValue } from '@family/shared';
import { Avatar } from '../../components/Avatar';

/** GLOSSARY: Изход на ястие. */
export const OUTCOME_LABELS: Record<MealOutcome, string> = {
  keep: 'Остава',
  replace: 'За смяна',
  discuss: 'Да поговорим',
  pending: 'Чака глас',
};

const VOTE_LABELS: Record<VoteValue, string> = { up: 'за', down: 'против' };

export function voteOf(meal: Meal, userId: string): VoteValue | undefined {
  return meal.votes.find((vote) => vote.userId === userId)?.value;
}

/** Изходът като цветен етикет. */
export function OutcomeLabel({ outcome }: { outcome: MealOutcome }) {
  return (
    <span className={`outcome outcome--${outcome}`}>
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}

/** Гласът на един човек: аватарът с ✓ / ✗ / … и името с гласа за екранния четец. */
export function PersonVote({
  meal,
  user,
  showName = false,
}: {
  meal: Meal;
  user: User;
  showName?: boolean;
}) {
  const vote = voteOf(meal, user.id);
  const label = `${user.name}: ${vote ? VOTE_LABELS[vote] : 'няма глас'}`;
  return (
    <span className={`person-vote person-vote--${vote ?? 'none'}`}>
      <span className="person-vote__avatar" title={label}>
        <Avatar initial={user.initial} color={user.color} size="sm" />
        <span className="person-vote__mark" aria-hidden="true">
          {vote === 'up' ? '✓' : vote === 'down' ? '✗' : '…'}
        </span>
      </span>
      <span className={showName ? 'person-vote__name' : 'visually-hidden'}>
        {label}
      </span>
    </span>
  );
}

/** Моите 👎/👍: натиснатият е активен, втори натиск на същия го маха (`null`). */
export function MyVote({
  meal,
  userId,
  onVote,
  big = false,
}: {
  meal: Meal;
  userId: string;
  onVote: (value: VoteValue | null) => void;
  big?: boolean;
}) {
  const mine = voteOf(meal, userId);
  const press = (value: VoteValue) => onVote(mine === value ? null : value);
  return (
    <span className={`my-vote${big ? ' my-vote--big' : ''}`}>
      <button
        type="button"
        className="my-vote__button my-vote__button--down"
        aria-label="Против"
        aria-pressed={mine === 'down'}
        onClick={() => press('down')}
      >
        <span aria-hidden="true">👎{big && ' Не'}</span>
      </button>
      <button
        type="button"
        className="my-vote__button my-vote__button--up"
        aria-label="За"
        aria-pressed={mine === 'up'}
        onClick={() => press('up')}
      >
        <span aria-hidden="true">👍{big && ' Да'}</span>
      </button>
    </span>
  );
}
