import type { Appliance, CreateAppliance } from '@family/shared';
import { asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { appliance } from '../schema/appliance.js';

/** The unique index that keeps a name once in any case. */
export const APPLIANCE_NAME_UNIQUE = 'appliance_name_unique';

const columns = {
  id: appliance.id,
  name: appliance.name,
  enabled: appliance.enabled,
};

/** In the order they were added. */
export function listAppliances(db: DbExecutor): Promise<Appliance[]> {
  return db
    .select(columns)
    .from(appliance)
    .orderBy(asc(appliance.createdAt), asc(appliance.id));
}

/** The names of the enabled appliances, in their order: what `recipe.suggest` gets. */
export async function listEnabledApplianceNames(
  db: DbExecutor,
): Promise<string[]> {
  const rows = await db
    .select({ name: appliance.name })
    .from(appliance)
    .where(eq(appliance.enabled, true))
    .orderBy(asc(appliance.createdAt), asc(appliance.id));
  return rows.map((row) => row.name);
}

export async function insertAppliance(
  db: DbExecutor,
  values: CreateAppliance,
): Promise<Appliance> {
  const [row] = await db.insert(appliance).values(values).returning(columns);
  if (!row) {
    throw new Error('insert into appliance returned no row');
  }
  return row;
}

/** `undefined` when there is no such appliance. */
export async function setApplianceEnabled(
  db: DbExecutor,
  id: string,
  enabled: boolean,
): Promise<Appliance | undefined> {
  const [row] = await db
    .update(appliance)
    .set({ enabled })
    .where(eq(appliance.id, id))
    .returning(columns);
  return row;
}

/** `false` when there was no such appliance. */
export async function deleteAppliance(
  db: DbExecutor,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(appliance)
    .where(eq(appliance.id, id))
    .returning({ id: appliance.id });
  return rows.length > 0;
}
