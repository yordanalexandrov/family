import type { Recipe } from '@family/shared';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { dani, server } from '../../test/msw';
import { chickenWithRice } from '../../test/recipes';
import { renderApp, setUpDevice } from '../../test/render';
import { fakeRecognition, fakeSpeech } from '../../test/speech';

const stew: Recipe = {
  ...chickenWithRice,
  steps: [
    { text: 'Нарежи пилето.' },
    { text: 'Задуши с лука 15 мин.' },
    { text: 'Посоли и сервирай.' },
  ],
};

async function openCooking(mode: 'kiosk' | 'phone' | 'browser' = 'phone') {
  setUpDevice(mode, mode === 'kiosk' ? undefined : dani.id);
  server.use(
    http.get(`/api/recipes/${stew.id}`, () =>
      HttpResponse.json({ recipe: stew }),
    ),
  );
  const rendered = renderApp(`/recipes/${stew.id}/cook`);
  await screen.findByText(/^Стъпка \d от 3$/);
  return rendered;
}

function listeningNote() {
  return screen.getByRole('status', { name: 'Слушане' });
}

function micButton() {
  return screen.getByRole('button', { name: 'Слушай' });
}

describe('Слушане в Готвене', () => {
  it.each([
    ['kiosk', false],
    ['phone', true],
    ['browser', false],
  ] as const)(
    '🎤 пуска слушането на български и го спира с докосване (%s, webkit: %s)',
    async (mode, prefixed) => {
      const user = userEvent.setup();
      const recognition = fakeRecognition({ prefixed });
      await openCooking(mode);
      expect(micButton()).toHaveAttribute('aria-pressed', 'false');
      expect(recognition.listening()).toBe(false);

      await user.click(micButton());
      expect(micButton()).toHaveAttribute('aria-pressed', 'true');
      expect(recognition.settings()).toEqual({
        lang: 'bg-BG',
        continuous: true,
      });

      await user.click(micButton());
      expect(micButton()).toHaveAttribute('aria-pressed', 'false');
      expect(recognition.listening()).toBe(false);
    },
  );

  it('без `SpeechRecognition` 🎤 го няма', async () => {
    await openCooking();

    expect(screen.getByRole('button', { name: 'По-едър текст' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Слушай' }),
    ).not.toBeInTheDocument();
  });

  it('„напред“ и „назад“ (и синонимите им) сменят стъпката', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.say('Напред');
    expect(screen.getByText('Стъпка 2 от 3')).toBeVisible();
    recognition.say('следваща');
    expect(screen.getByText('Стъпка 3 от 3')).toBeVisible();
    recognition.say('назад.');
    expect(screen.getByText('Стъпка 2 от 3')).toBeVisible();
    recognition.say('Предишна');
    expect(screen.getByText('Стъпка 1 от 3')).toBeVisible();
    recognition.say('назад');
    expect(screen.getByText('Стъпка 1 от 3')).toBeVisible();
  });

  it('на последната стъпка „напред“ не прави нищо: „Готово“ е само с докосване', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(screen.getByRole('button', { name: 'Стъпка 3' }));
    await user.click(micButton());

    recognition.say('напред');

    expect(screen.getByText('Стъпка 3 от 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Готово' })).toBeVisible();
    expect(recognition.listening()).toBe(true);
  });

  it('фраза с повече от 3 думи и непозната дума не правят нищо', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.say('мисля, че трябва да мина напред');
    recognition.say('напредък');

    expect(screen.getByText('Стъпка 1 от 3')).toBeVisible();
    expect(listeningNote()).toHaveTextContent('');
  });

  it('изпълнената команда се показва за кратко до 🎤', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.say('напред');
    expect(listeningNote()).toHaveTextContent('Напред');

    act(() => vi.advanceTimersByTime(2000));
    expect(listeningNote()).toHaveTextContent('');
    vi.useRealTimers();
  });

  it('„прочети“ и „повтори“ четат текущата стъпка', async () => {
    const user = userEvent.setup();
    const speech = fakeSpeech();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.say('напред');
    recognition.say('Прочети');
    act(() => speech.finish());
    recognition.say('повтори!');

    expect(speech.spoken.map(({ text }) => text)).toEqual([
      'Стъпка 2. Задуши с лука 15 минути.',
      'Стъпка 2. Задуши с лука 15 минути.',
    ]);
  });

  it('„спри“ и „стоп“ спират четенето', async () => {
    const user = userEvent.setup();
    const speech = fakeSpeech();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.say('прочети');
    expect(speech.speaking()).toBe('Стъпка 1. Нарежи пилето.');
    recognition.say('спри');
    expect(speech.speaking()).toBeNull();

    recognition.say('повтори');
    recognition.say('Стоп.');
    expect(speech.speaking()).toBeNull();
    expect(speech.spoken).toHaveLength(2);
  });

  it('докато чете, приема само „спри“', async () => {
    const user = userEvent.setup();
    const speech = fakeSpeech();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());
    recognition.say('прочети');

    recognition.say('напред');
    recognition.say('повтори');
    expect(screen.getByText('Стъпка 1 от 3')).toBeVisible();
    expect(speech.spoken).toHaveLength(1);
    expect(speech.speaking()).toBe('Стъпка 1. Нарежи пилето.');

    recognition.say('стоп');
    recognition.say('напред');
    expect(screen.getByText('Стъпка 2 от 3')).toBeVisible();
  });

  it('след `end` от браузъра слуша отново, докато е включено', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.end();
    expect(recognition.listening()).toBe(true);
    recognition.fail('no-speech');
    expect(recognition.listening()).toBe(true);
    expect(recognition.starts()).toBe(3);
    recognition.say('напред');
    expect(screen.getByText('Стъпка 2 от 3')).toBeVisible();

    await user.click(micButton());
    expect(recognition.listening()).toBe(false);
    expect(recognition.starts()).toBe(3);
  });

  it.each([
    ['not-allowed', 'Няма достъп до микрофона'],
    ['network', 'Слушането иска мрежа'],
  ])('`%s` спира слушането с „%s“', async (error, message) => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.fail(error);

    expect(recognition.listening()).toBe(false);
    expect(micButton()).toHaveAttribute('aria-pressed', 'false');
    expect(listeningNote()).toHaveTextContent(message);

    await user.click(micButton());
    expect(recognition.listening()).toBe(true);
    expect(listeningNote()).toHaveTextContent('');
  });

  it('друга грешка спира слушането с „Слушането спря“', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.fail('language-not-supported');

    expect(recognition.listening()).toBe(false);
    expect(micButton()).toHaveAttribute('aria-pressed', 'false');
    expect(listeningNote()).toHaveTextContent('Слушането спря');
  });

  it('ако браузърът не пусне слушането отново след `end`, пише „Слушането спря“', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.refuseStart();
    recognition.end();

    expect(micButton()).toHaveAttribute('aria-pressed', 'false');
    expect(listeningNote()).toHaveTextContent('Слушането спря');
  });

  it('„спри“ без четене и без звънящ таймер не показва нищо', async () => {
    const user = userEvent.setup();
    fakeSpeech();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    recognition.say('спри');

    expect(listeningNote()).toHaveTextContent('');
  });

  it('спира при „Затвори“ и не се помни при следващото влизане', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    const first = await openCooking();
    await user.click(micButton());

    await user.click(screen.getByRole('button', { name: 'Затвори' }));
    expect(recognition.listening()).toBe(false);

    first.unmount();
    await openCooking();
    expect(micButton()).toHaveAttribute('aria-pressed', 'false');
    expect(recognition.listening()).toBe(false);
  });

  it('спира при излизане от Готвене (авто-връщането на kiosk е излизане)', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    const rendered = await openCooking('kiosk');
    await user.click(micButton());

    rendered.unmount();

    expect(recognition.listening()).toBe(false);
  });

  it('докато полето за въпрос е на фокус, не слуша; после продължава', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());

    await user.click(screen.getByRole('button', { name: 'Питай' }));
    const field = await screen.findByRole('textbox', {
      name: 'Твоят въпрос за стъпка 1',
    });
    expect(field).toHaveFocus();
    expect(recognition.listening()).toBe(false);

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'Въпрос' }),
    ).not.toBeInTheDocument();
    expect(recognition.listening()).toBe(true);
    expect(micButton()).toHaveAttribute('aria-pressed', 'true');
  });

  it('полето за въпрос остава на фокус при смяна на прозореца: слушането не продължава', async () => {
    const user = userEvent.setup();
    const recognition = fakeRecognition();
    await openCooking();
    await user.click(micButton());
    await user.click(screen.getByRole('button', { name: 'Питай' }));
    const field = await screen.findByRole('textbox', {
      name: 'Твоят въпрос за стъпка 1',
    });

    // Друг таб или приложение: `focusout` без `relatedTarget`, а полето остава `document.activeElement`.
    fireEvent.focusOut(field, { relatedTarget: null });

    expect(field).toHaveFocus();
    expect(recognition.listening()).toBe(false);
  });
});
