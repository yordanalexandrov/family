import {
  type Appliance,
  applianceResponseSchema,
  appliancesResponseSchema,
} from '@family/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test/app.js';
import { DANI } from '../test/users.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildTestApp();
  await app.ready();
});

afterAll(() => app.close());

const headers = { 'x-acting-user': DANI.id };
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

function inject(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    headers,
    ...(payload ? { payload } : {}),
  });
}

async function list(): Promise<Appliance[]> {
  const response = await inject('GET', '/api/appliances');
  expect(response.statusCode).toBe(200);
  return appliancesResponseSchema.parse(response.json()).appliances;
}

async function byName(start: string): Promise<Appliance> {
  const found = (await list()).find((a) => a.name.startsWith(start));
  if (!found) {
    throw new Error(`no appliance ${start}`);
  }
  return found;
}

describe('/api/appliances', () => {
  it('lists the household appliances of the data migration, all enabled, in their order', async () => {
    const appliances = await list();

    expect(appliances.map((a) => a.name)).toEqual([
      'air fryer (Cosori CAF-R121-KEU)',
      'мултикукър (Ninja SmartLid OL750EU) — готвене под налягане, на пара, бавно готвене, air fryer',
      'sous vide',
      'вакуум машина — само за сухи продукти, не за течности и маринати с течност',
      'кухненски робот ×2 (Bosch MUM5, Philips 7778) — месене, разбиване, рендосване, нарязване',
      'пасатор',
    ]);
    expect(appliances.every((a) => a.enabled)).toBe(true);
  });

  it('turns an appliance off and on again', async () => {
    const sousVide = await byName('sous vide');

    const off = await inject('PUT', `/api/appliances/${sousVide.id}`, {
      enabled: false,
    });
    expect(off.statusCode).toBe(200);
    expect(applianceResponseSchema.parse(off.json()).appliance).toEqual({
      ...sousVide,
      enabled: false,
    });
    expect((await byName('sous vide')).enabled).toBe(false);

    await inject('PUT', `/api/appliances/${sousVide.id}`, { enabled: true });
    expect((await byName('sous vide')).enabled).toBe(true);
  });

  it('adds a new appliance last, enabled unless said otherwise', async () => {
    const response = await inject('POST', '/api/appliances', {
      name: '  хлебопекарна  ',
    });

    expect(response.statusCode).toBe(201);
    const added = applianceResponseSchema.parse(response.json()).appliance;
    expect(added).toMatchObject({ name: 'хлебопекарна', enabled: true });
    expect((await list()).at(-1)).toEqual(added);

    const off = await inject('POST', '/api/appliances', {
      name: 'уок',
      enabled: false,
    });
    expect(off.json().appliance).toMatchObject({ name: 'уок', enabled: false });
  });

  it('refuses a blank name and one the household already has (any case)', async () => {
    expect(
      (await inject('POST', '/api/appliances', { name: '   ' })).statusCode,
    ).toBe(400);

    const duplicate = await inject('POST', '/api/appliances', {
      name: 'Sous Vide',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      error: 'conflict',
      code: 'appliance_exists',
    });
  });

  it('removes an appliance', async () => {
    const blender = await byName('пасатор');

    const response = await inject('DELETE', `/api/appliances/${blender.id}`);

    expect(response.statusCode).toBe(204);
    expect((await list()).map((a) => a.name)).not.toContain('пасатор');
    expect(
      (await inject('DELETE', `/api/appliances/${blender.id}`)).statusCode,
    ).toBe(404);
  });

  it('answers 404 for an unknown appliance', async () => {
    const response = await inject('PUT', `/api/appliances/${UNKNOWN_ID}`, {
      enabled: false,
    });
    expect(response.statusCode).toBe(404);
  });
});
