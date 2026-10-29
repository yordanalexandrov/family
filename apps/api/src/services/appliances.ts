import type { Appliance, CreateAppliance } from '@family/shared';
import type { Db } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import {
  APPLIANCE_NAME_UNIQUE,
  deleteAppliance,
  insertAppliance,
  listAppliances,
  setApplianceEnabled,
} from '../db/repositories/appliances.js';
import { NotFoundError, refuse } from './errors.js';

function notFound(): NotFoundError {
  return new NotFoundError('Няма такъв уред');
}

/** GLOSSARY: Уред. In the order they were added. */
export function getAppliances(db: Db): Promise<Appliance[]> {
  return listAppliances(db);
}

/** A name the household has already, in any case, is a `ConflictError` `appliance_exists`. */
export async function addAppliance(
  db: Db,
  input: CreateAppliance,
): Promise<Appliance> {
  try {
    return await insertAppliance(db, input);
  } catch (error) {
    if (isUniqueViolation(error, APPLIANCE_NAME_UNIQUE)) {
      throw refuse('appliance_exists', 'Този уред вече е в списъка');
    }
    throw error;
  }
}

export async function switchAppliance(
  db: Db,
  id: string,
  enabled: boolean,
): Promise<Appliance> {
  const appliance = await setApplianceEnabled(db, id, enabled);
  if (!appliance) {
    throw notFound();
  }
  return appliance;
}

export async function removeAppliance(db: Db, id: string): Promise<void> {
  if (!(await deleteAppliance(db, id))) {
    throw notFound();
  }
}
