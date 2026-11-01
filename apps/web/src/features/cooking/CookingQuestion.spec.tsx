import type { CookingChange, CookingQuestion, Recipe } from '@family/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { goOffline } from '../../test/network';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import { COOKING_PROGRESS_KEY } from './cooking-memory';

const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    {
      text: 'Настържи 2 домата и ги добави.',
      photoId: 'eeeeeeee-0000-4000-8000-000000000001',
    },
    { text: 'Посоли и сервирай.' },
  ],
};

const QUESTION = 'Мога ли с консерва pulp вместо доматите?';
const ANSWER =
  'Да. За 5 порции сложи около 250 g pulp вместо доматите и задуши 10 минути.';

let nextId = 1;

interface Posted {
  body: {
    question: string;
    step: number;
    servings: number;
    follows?: string;
    applied?: string[];
  };
  actingUser: string | null;
  /** The id the api gave the question. */
  id: string;
}

/** A question as the api stores it, `pending` until the run ends. */
function pendingQuestion(body: Posted['body']): CookingQuestion {
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
      const unknown = (body.applied ?? []).filter(
        (id) => !questions.get(id)?.question,
      );
      if (unknown.length > 0) {
        return HttpResponse.json(
          {
            error: 'not_found',
            code: 'no_applied_change',
            message: 'Няма такава промяна за готвенето на рецептата',
            ids: unknown,
          },
          { status: 404 },
        );
      }
      if (body.follows !== undefined && !questions.has(body.follows)) {
        return HttpResponse.json(
          {
            error: 'not_found',
            code: 'no_earlier_question',
            message: 'Няма такъв предишен въпрос за рецептата',
          },
          { status: 404 },
        );
      }
      const question = pendingQuestion(body);
      posted.push({
        body,
        actingUser: request.headers.get('x-acting-user'),
        id: question.id,
      });
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
  const rendered = renderApp(`/recipes/${stew.id}/cook?servings=5`);
  await screen.findByText(/^Стъпка \d от 3$/);
  return rendered;
}

/** Closes the app (a reload, the kiosk going back to the dashboard) and opens Готвене again. */
async function reopenCooking(
  rendered: { unmount: () => void },
  mode: Parameters<typeof openCooking>[0] = 'phone',
) {
  rendered.unmount();
  return openCooking(mode);
}

/** Opens the sheet „Въпрос“ without asking. */
async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Питай' }));
  return screen.findByRole('dialog', { name: 'Въпрос' });
}

async function askInSheet(
  user: ReturnType<typeof userEvent.setup>,
  question = QUESTION,
) {
  await user.click(screen.getByRole('button', { name: 'Питай' }));
  const sheet = await screen.findByRole('dialog', { name: 'Въпрос' });
  await user.type(within(sheet).getByLabelText('Твоят въпрос'), question);
  await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));
  return sheet;
}

/** Types and sends one more question in the open sheet. */
async function askMore(
  user: ReturnType<typeof userEvent.setup>,
  sheet: HTMLElement,
  question: string,
) {
  await user.type(within(sheet).getByLabelText('Твоят въпрос'), question);
  await user.click(within(sheet).getByRole('button', { name: 'Изпрати' }));
}

/** The questions and answers in the sheet's list, item by item. */
function listed(sheet: HTMLElement): string[] {
  return within(within(sheet).getByRole('list', { name: 'Въпроси' }))
    .getAllByRole('listitem')
    .map((item) => (item.textContent ?? '').replaceAll('⏱', ''));
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
        {
          body: { question: QUESTION, step: 1, servings: 5 },
          actingUser,
          id: expect.any(String),
        },
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

  it('новият въпрос продължава последния: листът показва всички един под друг, а заявката помни кой продължава', async () => {
    const user = userEvent.setup();
    const FOLLOW_UP = 'а колко дълго да я варя тогава?';
    const LATER = 'ами ако стане много гъсто?';
    const posted = serveQuestions([
      { status: 'done', answer: ANSWER },
      { status: 'done', answer: '10–12 минути на слаб огън.' },
      { status: 'done', answer: 'Добави 2–3 с.л. вода.' },
    ]);
    await openCooking();

    const sheet = await askInSheet(user);
    await findAnswer(sheet, ANSWER);
    await askMore(user, sheet, FOLLOW_UP);
    await findAnswer(sheet, '10–12 минути на слаб огън.');
    await askMore(user, sheet, LATER);
    await findAnswer(sheet, 'Добави 2–3 с.л. вода.');

    expect(listed(sheet)).toEqual([
      `${QUESTION}${ANSWER}`,
      `${FOLLOW_UP}10–12 минути на слаб огън.`,
      `${LATER}Добави 2–3 с.л. вода.`,
    ]);
    const [first, second, third] = posted;
    expect(first?.body.follows).toBeUndefined();
    expect(second?.body).toMatchObject({
      question: FOLLOW_UP,
      follows: first?.id,
    });
    expect(third?.body).toMatchObject({ question: LATER, follows: second?.id });
  });

  it('докато въпрос чака, полето е изключено, а след отговора се включва', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serveQuestions([{ status: 'done', answer: ANSWER }], 1);
    await openCooking();

    const sheet = await askInSheet(user);
    await within(sheet).findByText('Мисли…');
    expect(within(sheet).getByLabelText('Твоят въпрос')).toBeDisabled();

    await vi.advanceTimersByTimeAsync(3_000);
    await findAnswer(sheet, ANSWER);
    expect(within(sheet).getByLabelText('Твоят въпрос')).toBeEnabled();
  });

  it('„Опитай пак“ на неуспешен допълнителен въпрос продължава същия предишен', async () => {
    const user = userEvent.setup();
    const posted = serveQuestions([
      { status: 'done', answer: ANSWER },
      { status: 'failed', error: 'timeout' },
      { status: 'done', answer: '10 минути.' },
    ]);
    await openCooking();

    const sheet = await askInSheet(user);
    await findAnswer(sheet, ANSWER);
    await askMore(user, sheet, 'а колко дълго?');
    await user.click(
      await within(sheet).findByRole('button', { name: 'Опитай пак' }),
    );
    await findAnswer(sheet, '10 минути.');

    expect(posted.map(({ body }) => body.follows)).toEqual([
      undefined,
      posted[0]?.id,
      posted[0]?.id,
    ]);
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

  describe('паметта на устройството', () => {
    it('въпросите оцеляват презареждане заедно със стъпката, а новият продължава запомнения', async () => {
      const user = userEvent.setup();
      const posted = serveQuestions([
        { status: 'done', answer: ANSWER },
        { status: 'done', answer: '10 минути.' },
      ]);
      const first = await openCooking();
      const sheet = await askInSheet(user);
      await findAnswer(sheet, ANSWER);
      await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
      await user.click(screen.getByRole('button', { name: 'Напред' }));

      await reopenCooking(first);
      expect(screen.getByText('Стъпка 2 от 3')).toBeInTheDocument();
      const reopened = await openSheet(user);
      expect(await findAnswer(reopened, ANSWER)).toBeInTheDocument();
      expect(within(reopened).getByText(QUESTION)).toBeInTheDocument();
      await askMore(user, reopened, 'а колко дълго?');
      await findAnswer(reopened, '10 минути.');

      expect(posted[1]?.body).toMatchObject({
        question: 'а колко дълго?',
        step: 1,
        follows: posted[0]?.id,
      });
    });

    it('изчезват при нов ден и при „Готово“ на последната стъпка', async () => {
      const user = userEvent.setup();
      serveQuestions([{ status: 'done', answer: ANSWER }]);
      atTime('2026-11-01T19:00:00+02:00');
      const first = await openCooking();
      await user.click(
        within(await askInSheet(user)).getByRole('button', { name: 'Готово' }),
      );

      atTime('2026-11-02T00:10:00+02:00');
      const nextDay = await reopenCooking(first);
      expect(await asked(user)).toEqual([]);

      await user.click(
        within(await askInSheet(user)).getByRole('button', { name: 'Готово' }),
      );
      await user.click(screen.getByRole('button', { name: 'Стъпка 3' }));
      await user.click(screen.getByRole('button', { name: 'Готово' }));
      await reopenCooking(nextDay);
      expect(await asked(user)).toEqual([]);
    });

    it('чакащият въпрос продължава да пита след презареждане', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      serveQuestions([{ status: 'done', answer: ANSWER }], 2);
      const first = await openCooking();
      await within(await askInSheet(user)).findByText('Мисли…');

      await reopenCooking(first);
      const sheet = await openSheet(user);
      expect(within(sheet).getByText(QUESTION)).toBeInTheDocument();
      expect(await within(sheet).findByText('Мисли…')).toBeInTheDocument();
      expect(within(sheet).getByLabelText('Твоят въпрос')).toBeDisabled();

      await vi.advanceTimersByTimeAsync(3_000);
      expect(await findAnswer(sheet, ANSWER)).toBeInTheDocument();
    });

    it('изтеклият въпрос (`stale`) показва неуспеха с „Опитай пак“', async () => {
      const user = userEvent.setup();
      const posted = serveQuestions([
        { status: 'failed', error: 'stale' },
        { status: 'done', answer: ANSWER },
      ]);
      const first = await openCooking();
      await user.click(
        within(await askInSheet(user)).getByRole('button', { name: 'Готово' }),
      );

      await reopenCooking(first);
      const sheet = await openSheet(user);
      expect(
        await within(sheet).findByText(
          'AI не успя да отговори: сървърът се рестартира междувременно. Опитай пак.',
        ),
      ).toBeInTheDocument();
      await user.click(
        within(sheet).getByRole('button', { name: 'Опитай пак' }),
      );

      expect(await findAnswer(sheet, ANSWER)).toBeInTheDocument();
      expect(posted.map(({ body }) => body.question)).toEqual([
        QUESTION,
        QUESTION,
      ]);
    });

    it('изгубеният въпрос (404) показва неуспеха с „Опитай пак“, а повторният започва нова верига', async () => {
      const user = userEvent.setup();
      serveQuestions([{ status: 'done', answer: ANSWER }]);
      const first = await openCooking();
      await findAnswer(await askInSheet(user), ANSWER);

      // api вече не знае въпросите (напр. друга база).
      const posted = serveQuestions([{ status: 'done', answer: '10 минути.' }]);
      await reopenCooking(first);
      const sheet = await openSheet(user);
      expect(within(sheet).getByText(QUESTION)).toBeInTheDocument();
      expect(
        await within(sheet).findByText('AI не успя да отговори. Опитай пак.'),
      ).toBeInTheDocument();
      expect(within(sheet).getByLabelText('Твоят въпрос')).toBeEnabled();
      await user.click(
        within(sheet).getByRole('button', { name: 'Опитай пак' }),
      );

      expect(await findAnswer(sheet, '10 минути.')).toBeInTheDocument();
      expect(listed(sheet)).toEqual([`${QUESTION}10 минути.`]);
      expect(posted.map(({ body }) => body)).toEqual([
        { question: QUESTION, step: 0, servings: 5 },
      ]);
    });

    it('въпрос, който api е изгубило след като листът го е прочел, не се продължава: новият започва нова верига без него', async () => {
      const user = userEvent.setup();
      serveQuestions([
        {
          status: 'done',
          answer: ANSWER,
          change: {
            steps: [],
            ingredients: [{ kind: 'remove', index: 2 }],
          },
        },
      ]);
      await openCooking('browser');
      const sheet = await askInSheet(user);
      await findAnswer(sheet, ANSWER);
      await user.click(within(sheet).getByRole('button', { name: 'Промени' }));

      // api вече не знае първия въпрос (напр. друга база), а листът го помни прочетен.
      const posted = serveQuestions([{ status: 'done', answer: '10 минути.' }]);
      await askMore(user, sheet, 'а колко дълго?');

      expect(await findAnswer(sheet, '10 минути.')).toBeInTheDocument();
      expect(posted.map(({ body }) => body)).toEqual([
        { question: 'а колко дълго?', step: 0, servings: 5 },
      ]);
    });

    it.each([
      ['нечетим', () => '{"day":'],
      [
        'с повредени въпроси',
        (raw: string) => {
          const stored = JSON.parse(raw) as {
            recipes: Record<string, { questions: unknown }>;
          };
          for (const recipe of Object.values(stored.recipes)) {
            recipe.questions = [{ id: 5 }, 'въпрос'];
          }
          return JSON.stringify(stored);
        },
      ],
    ])('запис %s се чете като без въпроси', async (_, corrupt) => {
      const user = userEvent.setup();
      serveQuestions([{ status: 'done', answer: ANSWER }]);
      const first = await openCooking();
      await user.click(
        within(await askInSheet(user)).getByRole('button', { name: 'Готово' }),
      );
      localStorage.setItem(
        COOKING_PROGRESS_KEY,
        corrupt(localStorage.getItem(COOKING_PROGRESS_KEY) ?? ''),
      );

      await reopenCooking(first);
      expect(await asked(user)).toEqual([]);
      await findAnswer(await askInSheet(user), ANSWER);
    });
  });
});

describe('„Промени“ (промяна за готвенето)', () => {
  /** Asked for 5: лук → консерва pulp, без сол, захар отгоре. */
  const PULP: CookingChange = {
    steps: [],
    ingredients: [
      {
        kind: 'replace',
        index: 1,
        ingredient: { name: 'консерва pulp', quantity: 250, unit: 'g' },
      },
      { kind: 'remove', index: 2 },
      {
        kind: 'add',
        ingredient: { name: 'захар', quantity: 1, unit: 'tsp' },
      },
    ],
  };
  const WITH_PULP = { status: 'done', answer: ANSWER, change: PULP } as const;

  /** The product lines in the column, as their text reads. */
  function products(): string[] {
    return within(screen.getByRole('list', { name: 'Продукти' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
  }

  async function applyIn(
    user: ReturnType<typeof userEvent.setup>,
    sheet: HTMLElement,
  ) {
    await findAnswer(sheet, ANSWER);
    await user.click(within(sheet).getByRole('button', { name: 'Промени' }));
  }

  it('„Промени“ сменя реда, задрасква махнатия и добавя новия накрая, всеки със знак', async () => {
    const user = userEvent.setup();
    serveQuestions([WITH_PULP]);
    await openCooking('browser');
    const sheet = await askInSheet(user);
    await findAnswer(sheet, ANSWER);
    expect(
      within(within(sheet).getByRole('list', { name: 'Промяна' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'вместо лук: консерва pulp 250 г',
      'без сол',
      'добави захар 1 ч.л.',
    ]);

    await applyIn(user, sheet);

    expect(within(sheet).getByText('Приложено')).toBeInTheDocument();
    expect(
      within(sheet).queryByRole('button', { name: 'Промени' }),
    ).not.toBeInTheDocument();
    expect(products()).toEqual([
      'пилешко филе625 г',
      'консерва pulpпроменено250 г',
      'солне се ползвапо вкус',
      'захарпроменено1 ч.л.',
    ]);
    expect(
      screen.getByRole('checkbox', { name: 'сол по вкус' }),
    ).toBeDisabled();
  });

  it('замененият ред губи отметката си, а „Върни“ връща рецептата', async () => {
    const user = userEvent.setup();
    serveQuestions([WITH_PULP]);
    await openCooking('browser');
    await user.click(screen.getByRole('checkbox', { name: 'лук 2,5 бр.' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'пилешко филе 625 г' }),
    );
    const sheet = await askInSheet(user);

    await applyIn(user, sheet);

    expect(
      screen.getByRole('checkbox', { name: 'консерва pulp 250 г' }),
    ).not.toBeChecked();
    // Пилешкото не е пипнато: остава в „Използвани“.
    expect(
      screen.getByRole('button', { name: 'Използвани (1)' }),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Върни' }));

    expect(
      within(sheet).getByRole('button', { name: 'Промени' }),
    ).toBeEnabled();
    expect(products()).toEqual(['лук2,5 бр.', 'солпо вкус']);
    expect(
      screen.getByRole('button', { name: 'Използвани (1)' }),
    ).toBeInTheDocument();
  });

  it('количествата на промяната са за порциите при въпроса и се мащабират при смяна на порциите', async () => {
    const user = userEvent.setup();
    serveQuestions([WITH_PULP]);
    await openCooking('browser');
    const sheet = await askInSheet(user);
    await applyIn(user, sheet);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await user.click(
      screen.getByRole('button', { name: 'Една порция повече' }),
    );

    expect(products()).toEqual([
      'пилешко филе750 г',
      'консерва pulpпроменено300 г',
      'солне се ползвапо вкус',
      'захарпроменено1,2 ч.л.',
    ]);
  });

  it('следващият въпрос праща приложените промени (`applied`), по реда на прилагане', async () => {
    const user = userEvent.setup();
    const posted = serveQuestions([
      WITH_PULP,
      { status: 'done', answer: '10 минути.' },
    ]);
    await openCooking('browser');
    const sheet = await askInSheet(user);
    await applyIn(user, sheet);

    await askMore(user, sheet, 'а колко дълго?');
    await findAnswer(sheet, '10 минути.');

    expect(posted[0]?.body.applied).toBeUndefined();
    expect(posted[1]?.body).toMatchObject({
      follows: posted[0]?.id,
      applied: [posted[0]?.id],
    });
  });

  it('приложената промяна оцелява презареждане, с „Върни“ в листа', async () => {
    const user = userEvent.setup();
    serveQuestions([WITH_PULP]);
    const first = await openCooking('browser');
    await applyIn(user, await askInSheet(user));

    await reopenCooking(first, 'browser');

    expect(products()).toContain('консерва pulpпроменено250 г');
    const sheet = await openSheet(user);
    await findAnswer(sheet, ANSWER);
    expect(within(sheet).getByText('Приложено')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Върни' }));
    expect(products()).toEqual([
      'пилешко филе625 г',
      'лук2,5 бр.',
      'солпо вкус',
    ]);
  });

  describe('стъпки', () => {
    /** Консервата се отцежда и задушава по-кратко: нов текст на стъпка 2, заедно с продукта. */
    const DRAIN: CookingChange = {
      ingredients: [
        PULP.ingredients[0] as CookingChange['ingredients'][number],
      ],
      steps: [
        { number: 2, text: 'Отцеди консервата pulp, добави я и задуши 5 мин.' },
      ],
    };
    const WITH_DRAIN = {
      status: 'done',
      answer: ANSWER,
      change: DRAIN,
    } as const;

    /** The step on the screen, as its text reads. */
    function stepText(): string {
      const steps = screen.getByRole('region', { name: 'Стъпки' });
      return (
        steps.querySelector('.cooking-steps__text')?.textContent ?? ''
      ).replaceAll('⏱', '');
    }

    /** Applies the change in the sheet, closes it and goes to step 2. */
    async function appliedOnStep2(user: ReturnType<typeof userEvent.setup>) {
      const sheet = await askInSheet(user);
      await applyIn(user, sheet);
      await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
      await user.click(screen.getByRole('button', { name: 'Напред' }));
    }

    it('листът казва коя стъпка сменя и с какъв текст', async () => {
      const user = userEvent.setup();
      serveQuestions([WITH_DRAIN]);
      await openCooking('browser');
      const sheet = await askInSheet(user);
      await findAnswer(sheet, ANSWER);

      expect(
        within(within(sheet).getByRole('list', { name: 'Промяна' }))
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        'вместо лук: консерва pulp 250 г',
        'стъпка 2: Отцеди консервата pulp, добави я и задуши 5 мин.',
      ]);
    });

    it('„Промени“ дава на стъпката новия текст със знак, а номерът, броят и снимката остават', async () => {
      const user = userEvent.setup();
      serveQuestions([WITH_DRAIN]);
      await openCooking('browser');

      await appliedOnStep2(user);

      expect(screen.getByText('Стъпка 2 от 3')).toBeInTheDocument();
      expect(stepText()).toBe(
        'променено Отцеди консервата pulp, добави я и задуши 5 мин.',
      );
      expect(
        screen.getByRole('img', { name: 'Снимката на стъпка 2' }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('group', { name: 'Към стъпка' })).getAllByRole(
          'button',
        ),
      ).toHaveLength(3);
      expect(products()).toContain('консерва pulpпроменено250 г');
    });

    it('време в новия текст пуска таймер на стъпката', async () => {
      const user = userEvent.setup();
      serveQuestions([WITH_DRAIN]);
      await openCooking('browser');
      await appliedOnStep2(user);

      await user.click(screen.getByRole('button', { name: 'Таймер 5 мин' }));

      expect(timerRows()).toHaveLength(1);
      expect(timerRows()[0]).toHaveTextContent(/^Стъпка 2 · 5 мин/);
    });

    it('„Върни“ връща стария текст без знака, а другите стъпки не се пипат', async () => {
      const user = userEvent.setup();
      serveQuestions([WITH_DRAIN]);
      await openCooking('browser');
      await appliedOnStep2(user);
      await user.click(screen.getByRole('button', { name: 'Назад' }));
      expect(stepText()).toBe('Нарежи пилето.');

      const sheet = await openSheet(user);
      await findAnswer(sheet, ANSWER);
      await user.click(within(sheet).getByRole('button', { name: 'Върни' }));
      await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
      await user.click(screen.getByRole('button', { name: 'Напред' }));

      expect(stepText()).toBe('Настържи 2 домата и ги добави.');
      expect(products()).toContain('лук2,5 бр.');
    });

    it('сменената стъпка оцелява презареждане', async () => {
      const user = userEvent.setup();
      serveQuestions([WITH_DRAIN]);
      const first = await openCooking('browser');
      await appliedOnStep2(user);

      await reopenCooking(first, 'browser');

      expect(screen.getByText('Стъпка 2 от 3')).toBeInTheDocument();
      expect(stepText()).toBe(
        'променено Отцеди консервата pulp, добави я и задуши 5 мин.',
      );
    });
  });

  it('отговор без промяна няма „Промени“', async () => {
    const user = userEvent.setup();
    serveQuestions([{ status: 'done', answer: ANSWER }]);
    await openCooking('browser');
    const sheet = await askInSheet(user);
    await findAnswer(sheet, ANSWER);

    expect(
      within(sheet).queryByRole('button', { name: 'Промени' }),
    ).not.toBeInTheDocument();
  });
});

/** The questions in the sheet „Въпрос“, opened anew; closes it again. */
async function asked(user: ReturnType<typeof userEvent.setup>) {
  const sheet = await openSheet(user);
  const list = within(sheet).queryByRole('list', { name: 'Въпроси' });
  const questions = list ? listed(sheet) : [];
  await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
  return questions;
}

/** The clock shows `iso` (only `Date`; timers stay real). */
function atTime(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
