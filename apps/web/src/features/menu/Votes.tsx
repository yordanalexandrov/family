import type { Meal, MealOutcome, User, VoteValue } from '@family/shared';

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

const VOTE_MARKS: Record<VoteValue, string> = { up: '✓', down: '✗' };

/**
 * Гласът на един човек с името му: „Поли: ✓“, „Поли: ✗“, „Поли: ?“ (още чака). Видимият знак е за окото, а екранният
 * четец чете „Поли: против“.
 */
export function PersonVote({ meal, user }: { meal: Meal; user: User }) {
  const vote = voteOf(meal, user.id);
  const label = `${user.name}: ${vote ? VOTE_LABELS[vote] : 'няма глас'}`;
  return (
    <span
      className={`person-vote person-vote--${vote ?? 'none'}`}
      title={label}
    >
      <span aria-hidden="true">{`${user.name}: ${vote ? VOTE_MARKS[vote] : '?'}`}</span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

/**
 * Моите 👎/👍 с надпис „Не“/„Да“: натиснатият е оцветен, втори натиск на същия го маха (`null`). На реда надписът е
 * под знака, за да остане бутонът тесен.
 */
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
        <span aria-hidden="true">👎</span>
        <span className="my-vote__text" aria-hidden="true">
          Не
        </span>
      </button>
      <button
        type="button"
        className="my-vote__button my-vote__button--up"
        aria-label="За"
        aria-pressed={mine === 'up'}
        onClick={() => press('up')}
      >
        <span aria-hidden="true">👍</span>
        <span className="my-vote__text" aria-hidden="true">
          Да
        </span>
      </button>
    </span>
  );
}
