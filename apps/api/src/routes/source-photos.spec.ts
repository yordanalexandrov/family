import {
  type RecipeImportDetail,
  recipeImportDetailSchema,
} from '@family/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { HttpResponse, http } from 'msw';
import sharp from 'sharp';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { recipe, recipeImportRequest } from '../db/schema/food.js';
import { sourcePhoto } from '../db/schema/source-photo.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import {
  CHAT_COMPLETIONS_URL,
  completion,
  normalizeAnswer,
  openclaw,
} from '../test/openclaw.js';
import { cameraJpeg, HEIC_PHOTO } from '../test/photos.js';
import { DANI } from '../test/users.js';

let app: FastifyInstance;

beforeAll(async () => {
  openclaw.listen({ onUnhandledFrame: 'error' });
  app = buildTestApp();
  await app.ready();
});

afterEach(() => openclaw.resetHandlers());

afterAll(async () => {
  await app.close();
  openclaw.close();
});

const headers = { 'x-acting-user': DANI.id };

/**
 * An import by photo (GLOSSARY: Източник на рецепта, ADR-0016), once its run has ended; the agent is down here unless
 * `answered`, which changes nothing of what was stored.
 */
async function photoImport(
  photos: Buffer[],
  { answered = false } = {},
): Promise<RecipeImportDetail> {
  openclaw.use(
    http.post(CHAT_COMPLETIONS_URL, async ({ request }) => {
      if (!answered) {
        return new HttpResponse(null, { status: 500 });
      }
      const body = (await request.json()) as {
        messages: { content: { type: string; text?: string }[] }[];
      };
      const input = JSON.parse(body.messages[0]?.content[0]?.text ?? '');
      return HttpResponse.json(
        completion(JSON.stringify(normalizeAnswer(input))),
      );
    }),
  );
  const form = new FormData();
  for (const bytes of photos) {
    form.append('photo', new Blob([bytes]), 'photo.jpg');
  }
  const response = await app.inject({
    method: 'POST',
    url: '/api/recipe-imports',
    headers,
    payload: form,
  });
  expect(response.statusCode).toBe(202);
  const id: string = response.json().request.id;
  let detail: RecipeImportDetail;
  do {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const got = await app.inject({
      method: 'GET',
      url: `/api/recipe-imports/${id}`,
      headers,
    });
    detail = recipeImportDetailSchema.parse(got.json());
  } while (detail.request.status === 'pending');
  return detail;
}

/** The ids of the photos an import by photo stored. */
async function storedPhotos(...photos: Buffer[]): Promise<string[]> {
  return (await photoImport(photos)).photos ?? [];
}

/** `GET` as an `<img>` asks for it: no acting user. */
function getPhoto(id: string, query = '') {
  return app.inject({ method: 'GET', url: `/api/source-photos/${id}${query}` });
}

describe('a photo of a recipe source', () => {
  it('is stored upright, at most 2000 px on the long side and without EXIF', async () => {
    // Stored lying 4000×2000; orientation 6 shows it standing.
    const [id] = await storedPhotos(
      await cameraJpeg({ width: 4000, height: 2000, orientation: 6 }),
    );

    const response = await getPhoto(id ?? '');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    const stored = await sharp(response.rawPayload).metadata();
    expect(stored).toMatchObject({ format: 'jpeg', width: 1000, height: 2000 });
    expect(stored.exif).toBeUndefined();
    expect(stored.orientation).toBeUndefined();
  });

  it('keeps a part of a screenshot at its size up to 2000 px, wider than a step photo', async () => {
    const [id] = await storedPhotos(
      await cameraJpeg({ width: 1800, height: 1200 }),
    );

    const stored = await sharp(
      (await getPhoto(id ?? '')).rawPayload,
    ).metadata();

    expect(stored).toMatchObject({ width: 1800, height: 1200 });
  });

  it('may be a HEIC from an iPhone, stored as a JPEG', async () => {
    const [id] = await storedPhotos(HEIC_PHOTO);

    const stored = await sharp(
      (await getPhoto(id ?? '')).rawPayload,
    ).metadata();

    expect(stored).toMatchObject({ format: 'jpeg', width: 2000, height: 1500 });
  });

  it('is a smaller picture with ?w=, and both answers are private and immutable', async () => {
    const [id = ''] = await storedPhotos(
      await cameraJpeg({ width: 1600, height: 1200 }),
    );

    const full = await getPhoto(id);
    const thumbnail = await getPhoto(id, '?w=240');

    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/jpeg');
    expect(await sharp(thumbnail.rawPayload).metadata()).toMatchObject({
      width: 240,
      height: 180,
    });
    expect(thumbnail.rawPayload.length).toBeLessThan(full.rawPayload.length);
    for (const response of [full, thumbnail]) {
      expect(response.headers['cache-control']).toBe(
        'private, max-age=31536000, immutable',
      );
    }
  });

  it('answers 404 for an unknown photo and 400 for a width out of range', async () => {
    const [id = ''] = await storedPhotos(
      await cameraJpeg({ width: 640, height: 480 }),
    );

    expect(
      (await getPhoto('99999999-9999-4999-8999-999999999999')).statusCode,
    ).toBe(404);
    expect((await getPhoto(id, '?w=0')).statusCode).toBe(400);
    expect((await getPhoto(id, '?w=5000')).statusCode).toBe(400);
  });
});

describe('the source photo orphans of the night cron', () => {
  async function photoStatus(id: string): Promise<number> {
    return (await getPhoto(id, '?w=16')).statusCode;
  }

  async function aPhoto(): Promise<Buffer> {
    return cameraJpeg({ width: 64, height: 48 });
  }

  /** A recipe whose source is the photo `id`, its import gone. */
  async function recipeWith(id: string, archived = false) {
    await testDb()
      .insert(recipe)
      .values({
        title: `Рецепта ${id}`,
        servings: 2,
        steps: [{ text: 'Сготви.' }],
        tags: ['dinner'],
        sourcePhotos: [id],
        archivedAt: archived ? new Date('2026-10-01T12:00:00Z') : null,
      });
  }

  /** Deletes the import the photo `id` came from, as if it were never there. */
  async function withoutImport(id: string) {
    await testDb()
      .delete(recipeImportRequest)
      .where(sql`${id} = any(${recipeImportRequest.photos})`);
  }

  /** Photos stored on 1 November in every state, but `fresh` (the night of 4 to 5 November). */
  async function photos() {
    const [pending = ''] = await storedPhotos(await aPhoto());
    const rejectedImport = await photoImport([await aPhoto()], {
      answered: true,
    });
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/recipe-suggestions/${rejectedImport.suggestion?.id}/reject`,
      headers,
    });
    expect(rejected.statusCode).toBe(200);
    const [
      inRecipe = '',
      inArchivedRecipe = '',
      ofDeletedImport = '',
      fresh = '',
    ] = await storedPhotos(
      await aPhoto(),
      await aPhoto(),
      await aPhoto(),
      await aPhoto(),
    );
    await withoutImport(inRecipe);
    await recipeWith(inRecipe);
    await recipeWith(inArchivedRecipe, true);
    await testDb()
      .update(sourcePhoto)
      .set({ createdAt: new Date('2026-11-01T12:00:00Z') });
    await testDb()
      .update(sourcePhoto)
      .set({ createdAt: new Date('2026-11-04T23:00:00Z') })
      .where(sql`${sourcePhoto.id} = ${fresh}`);
    return {
      ofPendingImport: pending,
      ofRejectedImport: rejectedImport.photos?.[0] ?? '',
      inRecipe,
      inArchivedRecipe,
      ofDeletedImport,
      fresh,
    };
  }

  /** The night cron at `now`, and its log lines. */
  async function cronAt(now: string) {
    const lines: Record<string, unknown>[] = [];
    const cron = buildTestApp({
      openclaw: undefined,
      now: () => new Date(now),
      logger: {
        level: 'info',
        stream: { write: (line: string) => lines.push(JSON.parse(line)) },
      },
      scheduler: { firstRunDelayMs: 0 },
    });
    await cron.ready();
    return { cron, lines };
  }

  it('removes at night only the photos older than a day that no import and no recipe points at, and logs how many', async () => {
    const ids = await photos();
    // The import of the archived recipe goes too; deleting the import of `ofDeletedImport` leaves it an orphan.
    await withoutImport(ids.inArchivedRecipe);
    await withoutImport(ids.ofDeletedImport);
    // 03:30 in Sofia.
    const { cron, lines } = await cronAt('2026-11-05T01:30:00Z');
    try {
      await vi.waitFor(() => {
        expect(lines).toContainEqual(
          expect.objectContaining({ job: 'source-photo-orphans', removed: 1 }),
        );
      });
    } finally {
      await cron.close();
    }

    expect(await photoStatus(ids.ofDeletedImport)).toBe(404);
    expect(await photoStatus(ids.ofPendingImport)).toBe(200);
    expect(await photoStatus(ids.ofRejectedImport)).toBe(200);
    expect(await photoStatus(ids.inRecipe)).toBe(200);
    expect(await photoStatus(ids.inArchivedRecipe)).toBe(200);
  });

  it('keeps a fresh orphan, and every orphan during the day', async () => {
    const ids = await photos();
    await withoutImport(ids.fresh);
    await withoutImport(ids.ofDeletedImport);

    const day = await cronAt('2026-11-05T12:00:00Z');
    try {
      await vi.waitFor(() => {
        expect(day.lines).toContainEqual(
          expect.objectContaining({
            job: 'source-photo-orphans',
            msg: 'job finished',
          }),
        );
      });
    } finally {
      await day.cron.close();
    }
    expect(await photoStatus(ids.ofDeletedImport)).toBe(200);

    const night = await cronAt('2026-11-05T01:30:00Z');
    try {
      await vi.waitFor(() => {
        expect(night.lines).toContainEqual(
          expect.objectContaining({ job: 'source-photo-orphans', removed: 1 }),
        );
      });
    } finally {
      await night.cron.close();
    }
    expect(await photoStatus(ids.ofDeletedImport)).toBe(404);
    // Stored two and a half hours before: an import whose run may not have stored it as its own yet.
    expect(await photoStatus(ids.fresh)).toBe(200);
  });

  it('keeps the photos of a failed import imported again while either import points at them', async () => {
    const detail = await photoImport([await aPhoto(), await aPhoto()]);
    expect(detail.request.status).toBe('failed');
    const photos = detail.photos ?? [];
    const again = await app.inject({
      method: 'POST',
      url: '/api/recipe-imports',
      headers,
      payload: { kind: 'photo', photos },
    });
    expect(again.statusCode).toBe(202);
    const againId: string = again.json().request.id;
    await vi.waitFor(async () => {
      const got = await app.inject({
        method: 'GET',
        url: `/api/recipe-imports/${againId}`,
        headers,
      });
      expect(got.json().request.status).toBe('failed');
    });
    await testDb()
      .update(sourcePhoto)
      .set({ createdAt: new Date('2026-11-01T12:00:00Z') });

    /** Runs the night cron once, until it says how many it removed. */
    async function night(removed: number) {
      const { cron, lines } = await cronAt('2026-11-05T01:30:00Z');
      try {
        await vi.waitFor(() => {
          expect(lines).toContainEqual(
            expect.objectContaining({ job: 'source-photo-orphans', removed }),
          );
        });
      } finally {
        await cron.close();
      }
    }

    await testDb()
      .delete(recipeImportRequest)
      .where(sql`${recipeImportRequest.id} = ${detail.request.id}`);
    await night(0);
    for (const id of photos) {
      expect(await photoStatus(id)).toBe(200);
    }

    await testDb()
      .delete(recipeImportRequest)
      .where(sql`${recipeImportRequest.id} = ${againId}`);
    await night(2);
    for (const id of photos) {
      expect(await photoStatus(id)).toBe(404);
    }
  });
});
