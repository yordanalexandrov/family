// PROTOTYPE (#63): „Меню с гласове“ — три варианта на `/menu?variant=A|B|C`, само в dev, само на клон
// prototype/menu-votes. Данните са реалният план и рецептите; гласовете, коментарите и смените живеят в паметта.
import type { DateKey, MealPlan, User } from '@family/shared';
import { useRecipes } from '../../recipes/queries';
import { SAMPLE_POOL, useVotesModel } from './model';
import { PrototypeSwitcher, StatePanel, type VariantKey } from './shared';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';
import './votes.css';

export function PrototypeVotes({
  variant,
  plan,
  weekStart,
  users,
}: {
  variant: VariantKey;
  plan: MealPlan | null;
  weekStart: DateKey;
  users: User[];
}) {
  const recipes = useRecipes({});
  if (recipes.isPending) return null;
  const pool = recipes.data?.length
    ? recipes.data.map((recipe) => recipe.title)
    : SAMPLE_POOL;
  return (
    <Inner
      key={weekStart}
      variant={variant}
      plan={plan}
      weekStart={weekStart}
      users={users}
      pool={pool}
    />
  );
}

function Inner({
  variant,
  plan,
  weekStart,
  users,
  pool,
}: {
  variant: VariantKey;
  plan: MealPlan | null;
  weekStart: DateKey;
  users: User[];
  pool: string[];
}) {
  const model = useVotesModel(plan, weekStart, users, pool);
  return (
    <div className="pv">
      {variant === 'A' && <VariantA model={model} />}
      {variant === 'B' && <VariantB model={model} />}
      {variant === 'C' && <VariantC model={model} />}
      <StatePanel model={model} />
      <PrototypeSwitcher current={variant} />
    </div>
  );
}
