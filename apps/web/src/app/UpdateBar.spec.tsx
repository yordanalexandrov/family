import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppUpdateEnv, startAppUpdate } from './app-update';
import { UpdateBar } from './UpdateBar';

/** Минималният service worker, който модулът ползва: състояние, съобщения и `statechange`. */
class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  constructor(public state: ServiceWorkerState) {
    super();
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  become(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  updates = 0;
  async update() {
    this.updates += 1;
  }
  /** Браузърът намира нов service worker и започва да го инсталира. */
  find(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
  }
}

class FakeContainer extends EventTarget {
  constructor(public controller: object | null) {
    super();
  }
  /** Новият worker поема страницата. */
  takeOver() {
    this.controller = {};
    this.dispatchEvent(new Event('controllerchange'));
  }
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  set(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function setup({
  controlled = true,
  waiting = null,
  busy = false,
}: {
  controlled?: boolean;
  waiting?: FakeWorker | null;
  busy?: boolean;
} = {}) {
  const registration = new FakeRegistration();
  registration.waiting = waiting;
  const container = new FakeContainer(controlled ? {} : null);
  const doc = new FakeDocument();
  const reload = vi.fn();
  let now = 0;
  const env: AppUpdateEnv = {
    registration,
    container,
    document: doc,
    reload,
    now: () => now,
    isBusy: () => busy,
  };
  stops.push(startAppUpdate(env));
  return {
    registration,
    container,
    doc,
    reload,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const stops: (() => void)[] = [];

const MINUTE = 60_000;

describe('UpdateBar', () => {
  afterEach(() => {
    for (const stop of stops.splice(0)) {
      stop();
    }
  });

  it('при чакащ нов worker показва „Има нова версия“; „Обнови“ праща SKIP_WAITING и презарежда, когато той поеме', async () => {
    const waiting = new FakeWorker('installed');
    const { container, reload } = setup({ waiting });
    render(<UpdateBar />);

    expect(screen.getByText('Има нова версия')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Обнови' }));

    expect(waiting.posted).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(reload).not.toHaveBeenCalled();
    container.takeOver();
    expect(reload).toHaveBeenCalledOnce();
  });
  it('показва лентата, когато нов worker се инсталира, докато приложението е отворено', () => {
    const { registration } = setup();
    render(<UpdateBar />);
    expect(screen.queryByText('Има нова версия')).not.toBeInTheDocument();

    const worker = new FakeWorker('installing');
    act(() => registration.find(worker));
    registration.waiting = worker;
    act(() => worker.become('installed'));

    expect(screen.getByText('Има нова версия')).toBeInTheDocument();
  });

  it('първото инсталиране не е нова версия: без лента и без презареждане', () => {
    const { registration, container, reload } = setup({ controlled: false });
    render(<UpdateBar />);

    const worker = new FakeWorker('installing');
    act(() => registration.find(worker));
    registration.waiting = worker;
    act(() => worker.become('installed'));
    container.takeOver();

    expect(screen.queryByText('Има нова версия')).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('при връщане в приложението проверява за нова версия', () => {
    const { registration, doc } = setup();

    doc.set('hidden');
    doc.set('visible');

    expect(registration.updates).toBe(1);
  });

  it('скрито повече от 5 минути, без лист и форма: при връщане новата версия поема сама', () => {
    const waiting = new FakeWorker('installed');
    const { doc, advance } = setup({ waiting });

    doc.set('hidden');
    advance(5 * MINUTE);
    doc.set('visible');

    expect(waiting.posted).toEqual([{ type: 'SKIP_WAITING' }]);
  });

  it('не поема сама след кратко скриване или при отворен лист или форма', () => {
    const shortly = new FakeWorker('installed');
    const short = setup({ waiting: shortly });
    short.doc.set('hidden');
    short.advance(4 * MINUTE);
    short.doc.set('visible');

    const busyWorker = new FakeWorker('installed');
    const busy = setup({ waiting: busyWorker, busy: true });
    busy.doc.set('hidden');
    busy.advance(30 * MINUTE);
    busy.doc.set('visible');

    expect(shortly.posted).toEqual([]);
    expect(busyWorker.posted).toEqual([]);
  });
});
