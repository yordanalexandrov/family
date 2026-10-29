import { useState, useSyncExternalStore } from 'react';

/** Chrome (Android, десктоп) дава събитието, когато приложението може да се инсталира; Safari и Firefox — не. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STANDALONE_QUERY = '(display-mode: standalone)';

let offer: BeforeInstallPromptEvent | null = null;
let listening = false;
const listeners = new Set<() => void>();

function setOffer(next: BeforeInstallPromptEvent | null): void {
  offer = next;
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Пази `beforeinstallprompt` за бутон „Инсталирай“ по-късно: браузърът го дава веднъж, често преди екранът с бутона
 * да се покаже, затова `main.tsx` слуша от старта. `preventDefault` спира мини-лентата на Chrome — предлагаме го ние.
 */
export function listenForInstallPrompt(): void {
  if (listening) {
    return;
  }
  listening = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    setOffer(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => setOffer(null));
}

function subscribe(listener: () => void): () => void {
  listenForInstallPrompt();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isStandalone(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia(STANDALONE_QUERY).matches
  );
}

/**
 * Инсталиране като приложение: `standalone` — отворено е инсталираното приложение; `accepted` — човекът току-що
 * прие предложението; `install` — предложението на браузъра, ако го е дал (иначе човекът минава през менюто му).
 */
export function useInstallPrompt() {
  const current = useSyncExternalStore(subscribe, () => offer);
  const [accepted, setAccepted] = useState(false);

  async function install(event: BeforeInstallPromptEvent) {
    setOffer(null);
    await event.prompt();
    const { outcome } = await event.userChoice;
    setAccepted(outcome === 'accepted');
  }

  return {
    standalone: isStandalone(),
    accepted,
    install: current ? () => void install(current) : null,
  };
}
