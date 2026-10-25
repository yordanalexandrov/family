import { daysOfWeek } from '@family/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testDb } from '../../test/db.js';
import { DANI, POLI } from '../../test/users.js';
import { recipe } from './food.js';
import { meal, mealPlan, menuProposalRequest } from './menu.js';

// The menu tables have no routes yet (Меню 2); this spec proves the migration and the rules the routes rely on.

/** The constraint Postgres names when it refuses a write. */
async function refusal(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write;
  } catch (error) {
    for (
      let current = error;
      current instanceof Error;
      current = current.cause
    ) {
      const constraint = (current as { constraint?: string }).constraint;
      if (constraint) {
        return constraint;
      }
    }
    throw error;
  }
  return undefined;
}

/** The single row a `returning()` gave back. */
function only<T>(rows: T[]): T {
  const [row] = rows;
  if (!row || rows.length > 1) {
    throw new Error(`Expected one row, got ${rows.length}`);
  }
  return row;
}

async function insertRecipe(title: string): Promise<string> {
  const rows = await testDb()
    .insert(recipe)
    .values({ title, servings: 4, steps: ['Сготви.'], tags: ['dinner'] })
    .returning({ id: recipe.id });
  return only(rows).id;
}

async function insertPlan(weekStart: string): Promise<string> {
  const rows = await testDb()
    .insert(mealPlan)
    .values({ weekStart, createdBy: DANI.id })
    .returning({ id: mealPlan.id });
  return only(rows).id;
}

const servings = { [DANI.id]: 1, [POLI.id]: 1 };

describe('menu schema', () => {
  it('stores a plan with seven dinners, one with a recipe, cook and why, one with only a note', async () => {
    const db = testDb();
    const recipeId = await insertRecipe('Леща яхния');
    const planId = await insertPlan('2026-11-02');
    const [, , ...rest] = daysOfWeek('2026-11-02');
    await db.insert(meal).values([
      {
        planId,
        date: '2026-11-02',
        slot: 'dinner',
        recipeId,
        cookUserId: POLI.id,
        servings,
        why: 'Без месо за начало.',
      },
      {
        planId,
        date: '2026-11-03',
        slot: 'dinner',
        note: 'ядем навън',
        servings,
      },
      ...rest.map((date) => ({
        planId,
        date,
        slot: 'dinner' as const,
        servings,
      })),
    ]);

    const meals = await db
      .select()
      .from(meal)
      .where(eq(meal.planId, planId))
      .orderBy(meal.date);

    expect(meals).toHaveLength(7);
    expect(meals[0]).toMatchObject({
      date: '2026-11-02',
      recipeId,
      note: null,
      cookUserId: POLI.id,
      servings,
      why: 'Без месо за начало.',
    });
    expect(meals[1]).toMatchObject({ recipeId: null, note: 'ядем навън' });
  });

  it('allows one plan per week', async () => {
    await insertPlan('2026-11-02');

    expect(await refusal(insertPlan('2026-11-02'))).toBe(
      'meal_plan_week_start_unique',
    );
  });

  it('allows one meal per day and slot of a plan', async () => {
    const planId = await insertPlan('2026-11-02');
    const dinner = {
      planId,
      date: '2026-11-02',
      slot: 'dinner' as const,
      servings,
    };
    await testDb().insert(meal).values(dinner);

    expect(await refusal(testDb().insert(meal).values(dinner))).toBe(
      'meal_plan_date_slot_key',
    );
  });

  it('refuses a slot that is not a meal of the day', async () => {
    const planId = await insertPlan('2026-11-02');

    expect(
      await refusal(
        testDb()
          .insert(meal)
          .values({
            planId,
            date: '2026-11-02',
            slot: 'quick' as never /* refused by the types too */,
            servings,
          }),
      ),
    ).toBe('meal_slot_check');
  });

  it('keeps a recipe that a meal uses from being deleted', async () => {
    const recipeId = await insertRecipe('Мусака');
    const planId = await insertPlan('2026-11-02');
    await testDb().insert(meal).values({
      planId,
      date: '2026-11-02',
      slot: 'dinner',
      recipeId,
      servings,
    });

    expect(
      await refusal(testDb().delete(recipe).where(eq(recipe.id, recipeId))),
    ).toBe('meal_recipe_id_recipe_id_fk');
  });

  it('deletes the meals together with their plan', async () => {
    const db = testDb();
    const planId = await insertPlan('2026-11-02');
    await db
      .insert(meal)
      .values({ planId, date: '2026-11-02', slot: 'dinner', servings });

    await db.delete(mealPlan).where(eq(mealPlan.id, planId));

    expect(await db.select().from(meal)).toEqual([]);
  });

  it('allows one pending proposal per week, and a new one after it failed', async () => {
    const db = testDb();
    const pending = {
      weekStart: '2026-11-02',
      requestedBy: DANI.id,
      status: 'pending' as const,
    };
    const first = only(
      await db.insert(menuProposalRequest).values(pending).returning(),
    );

    expect(await refusal(db.insert(menuProposalRequest).values(pending))).toBe(
      'menu_proposal_request_pending_week_key',
    );

    await db
      .update(menuProposalRequest)
      .set({ status: 'failed', error: 'timeout', finishedAt: new Date() })
      .where(eq(menuProposalRequest.id, first.id));

    expect(
      await refusal(db.insert(menuProposalRequest).values(pending)),
    ).toBeUndefined();
  });

  it('refuses an unknown proposal status', async () => {
    expect(
      await refusal(
        testDb()
          .insert(menuProposalRequest)
          .values({
            weekStart: '2026-11-02',
            requestedBy: DANI.id,
            status: 'draft' as never /* refused by the types too */,
          }),
      ),
    ).toBe('menu_proposal_request_status_check');
  });
});
