import type { CookingQuestion, Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { goOffline } from '../../test/network';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';

const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Настържи 2 домата и ги добави.' },
    { text: 'Посоли и сервирай.' },
  ],
};

const QUESTION = 'Мога ли с консерва pulp вместо доматите?';
const ANSWER =
  'Да. За 5 порции сложи около 250 g pulp вместо доматите и задуши 10 минути.';

let nextId = 1;

/** A question as the api stores it, `pending` until the run ends. */
function pendingQuestion(body: {
  question: string;
  step: number;
  servings: number;
}): CookingQuestion {
  const id = `dddddddd-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  return {
    id,
    recipeId: stew.id,
    ...body,
    status: 'pending',
    requestedBy: dani.id,
    createdAt: '2026-11-01T18:00:00.000Z',
  };
}

interface Posted {
  body: { question: string; step: number; servings: number };
  actingUser: string | null;
}

/**
 * The recipe and its questions: each `POST` stores a pending question, and its `GET` answers with `finished[n]` (for the
 * n-th question asked) once it has been read `pendingPolls` times. Returns the posted bodies.
 */
function serveQuestions(
  finished: Partial<CookingQuestion>[],
  pendingPolls = 0,
) {
  const posted: Posted[] = [];
  const questions = new Map<
    string,
    { question: CookingQuestion; polls: number; index: number }
  >();
  server.use(
    http.get(`/api/recipes/${stew.id}`, () =>
      HttpResponse.json({ recipe: stew }),
    ),
    http.post(`/api/recipes/${stew.id}/questions`, async ({ request }) => {
      const body = (await request.json()) as Posted['body'];
      posted.push({ body, actingUser: request.headers.get('x-acting-user') });
      const question = pendingQuestion(body);
      questions.set(question.id, {
        question,
        polls: 0,
        index: posted.length - 1,
      });
      return HttpResponse.json({ request: question }, { status: 202 });
    }),
    http.get('/api/recipes/questions/:id', ({ params }) => {
      const stored = questions.get(String(params.id));
      if (!stored) {
        return HttpResponse.json({ error: 'not_found' }, { status: 404 });
      }
      stored.polls += 1;
      const done = stored.polls > pendingPolls;
      return HttpResponse.json({
        request: done
          ? {
              ...stored.question,
              finishedAt: '2026-11-01T18:00:12.000Z',
              ...(finished[stored.index] ?? finished.at(-1)),
            }
          : stored.question,
      });
    }),
  );
  return posted;
}

async function openCooking(mode: 'kiosk' | 'phone' | 'browser' = 'phone') {
  setUpDevice(mode, mode === 'kiosk' ? undefined : dani.id);
  renderApp(`/recipes/${stew.id}/cook?servings=5`);
  await screen.findByText('Стъпка 1 от 3');
}

async function askInSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Питай' }));
  const sheet = await screen.findByRole('dialog', { name: 'Въпрос' });
  await user.type(within(sheet).getByLabelText('Твоят въпрос'), QUESTION);
  await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));
  return sheet;
}

/** The answer's paragraph in the sheet, once it has come: its text can be split by timer buttons („⏱ 10 мин“). */
function findAnswer(sheet: HTMLElement, answer: string) {
  return within(sheet).findByText(
    (_, element) =>
      element?.tagName === 'P' &&
      element.textContent?.replaceAll('⏱', '') === answer,
  );
}

function timerRows() {
  return within(screen.getByRole('region', { name: 'Таймери' })).getAllByRole(
    'listitem',
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Въпрос в Готвене', () => {
  it.each([
    ['kiosk', null],
    ['phone', dani.id],
    ['browser', dani.id],
  ] as const)(
    '„Питай“ праща въпроса със стъпката и порциите на екрана и показва отговора (%s)',
    async (mode, actingUser) => {
      const user = userEvent.setup();
      const posted = serveQuestions([{ status: 'done', answer: ANSWER }]);
      await openCooking(mode);
      await user.click(screen.getByRole('button', { name: 'Напред' }));

      const sheet = await askInSheet(user);

      expect(await findAnswer(sheet, ANSWER)).toBeInTheDocument();
      expect(within(sheet).getByText(QUESTION)).toBeInTheDocument();
      expect(posted).toEqual([
        { body: { question: QUESTION, step: 1, servings: 5 }, actingUser },
      ]);
      expect(within(sheet).getByLabelText('Твоят въпрос')).toHaveValue('');
    },
  );

  it('докато чака, показва „Мисли…“, а затвореният лист не спира готвенето и показва отговора, когато се отвори пак', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serveQuestions([{ status: 'done', answer: ANSWER }], 1);
    await openCooking();

    const sheet = await askInSheet(user);
    expect(await within(sheet).findByText('Мисли…')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Изпрати' }),
    ).toBeDisabled();

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    expect(
      screen.queryByRole('dialog', { name: 'Въпрос' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Напред' }));
    expect(screen.getByText('Стъпка 2 от 3')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(3_000);

    await user.click(screen.getByRole('button', { name: 'Питай' }));
    const reopened = await screen.findByRole('dialog', { name: 'Въпрос' });
    expect(within(reopened).getByText(QUESTION)).toBeInTheDocument();
    expect(await findAnswer(reopened, ANSWER)).toBeInTheDocument();
  });

  it('при неуспех показва съобщението за кода, а „Опитай пак“ праща същия въпрос отново', async () => {
    const user = userEvent.setup();
    const posted = serveQuestions([
      { status: 'failed', error: 'invalid_output' },
      { status: 'done', answer: ANSWER },
    ]);
    await openCooking();

    const sheet = await askInSheet(user);

    expect(
      await within(sheet).findByText(
        'AI върна отговор, който не мога да прочета. Опитай пак.',
      ),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Опитай пак' }));

    expect(await findAnswer(sheet, ANSWER)).toBeInTheDocument();
    expect(posted.map(({ body }) => body.question)).toEqual([
      QUESTION,
      QUESTION,
    ]);
    expect(within(sheet).getAllByText(QUESTION)).toHaveLength(1);
    expect(
      within(sheet).queryByRole('button', { name: 'Опитай пак' }),
    ).not.toBeInTheDocument();
  });

  it('без връзка „Питай“ е изключен с „Иска връзка“', async () => {
    serveQuestions([{ status: 'done', answer: ANSWER }]);
    await openCooking();

    const online = goOffline();
    try {
      const ask = screen.getByRole('button', { name: 'Питай' });
      expect(ask).toBeDisabled();
      expect(ask).toHaveAccessibleDescription('Иска връзка');
    } finally {
      online();
    }
  });

  describe('времената в отговора', () => {
    async function answered(answer: string) {
      const user = userEvent.setup();
      serveQuestions([{ status: 'done', answer }]);
      await openCooking();
      await user.click(screen.getByRole('button', { name: 'Напред' }));
      const sheet = await askInSheet(user);
      return { user, sheet, answer: await findAnswer(sheet, answer) };
    }

    it('време в отговора е бутон, който пуска таймер „Въпрос · …“', async () => {
      const { user, sheet, answer } = await answered(
        'Да, задуши 10 мин под капак.',
      );

      expect(answer).toHaveTextContent('Да, задуши ⏱10 мин под капак.');
      await user.click(
        within(answer).getByRole('button', { name: 'Таймер 10 мин' }),
      );
      await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

      expect(timerRows()).toHaveLength(1);
      expect(timerRows()[0]).toHaveTextContent(/^Въпрос · 10 мин/);
      expect(timerRows()[0]).toHaveTextContent('10:00');
    });

    it('интервал („10–15 мин“) пуска таймер до долната граница, както в стъпка', async () => {
      const { user, sheet, answer } = await answered(
        'Задуши 10–15 мин, докато омекне.',
      );

      await user.click(
        within(answer).getByRole('button', { name: 'Таймер 10–15 мин' }),
      );
      await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

      expect(timerRows()[0]).toHaveTextContent(/^Въпрос · 10–15 мин/);
      expect(timerRows()[0]).toHaveTextContent('10:00');
    });

    it('отговор без време е само текст', async () => {
      const { answer } = await answered('Да, консервата става.');

      expect(answer).toHaveTextContent('Да, консервата става.');
      expect(within(answer).queryByRole('button')).toBeNull();
    });
  });
});
