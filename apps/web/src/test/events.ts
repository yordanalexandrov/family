import type { ServerEvent } from '@family/shared';
import { expect } from 'vitest';

/** `EventSource` без мрежа: тестът отваря връзката и праща събития като api-то. */
export class MockEventSource extends EventTarget {
  static instances: MockEventSource[] = [];
  readonly url: string;
  closed = false;

  constructor(url: string) {
    super();
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.dispatchEvent(new Event('open'));
  }

  error() {
    this.dispatchEvent(new Event('error'));
  }

  send(event: ServerEvent) {
    this.dispatchEvent(
      new MessageEvent(event.type, { data: JSON.stringify(event) }),
    );
  }
}

/** Единствената отворена връзка на приложението. */
export function source(): MockEventSource {
  const open = MockEventSource.instances.filter((s) => !s.closed);
  expect(open).toHaveLength(1);
  return open[0] as MockEventSource;
}
