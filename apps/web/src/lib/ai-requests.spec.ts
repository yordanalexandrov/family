import type { ContractFailure } from '@family/shared';
import { describe, expect, it } from 'vitest';
import { type AiRequestKind, failureMessage } from './ai-requests';

const createdAt = '2026-10-28T18:00:00.000Z';

function failed(
  error: ContractFailure | undefined,
  finishedAt = '2026-10-28T18:00:20.000Z',
) {
  return { error, createdAt, finishedAt };
}

const NEXT: Record<AiRequestKind, string> = {
  menu: 'Опитай пак или започни празно.',
  replace: 'Опитай пак или избери сам.',
  suggest: 'Опитай пак или с друга подсказка.',
  import: 'Опитай пак.',
  refine: 'Опитай пак.',
};

const FAILED: Record<AiRequestKind, string> = {
  menu: 'AI не успя да предложи меню',
  replace: 'AI не успя да предложи друго ястие',
  suggest: 'AI не успя да предложи рецепти',
  import: 'AI не успя да прочете рецептата',
  refine: 'AI не успя да подобри рецептата',
};

const KINDS = Object.keys(NEXT) as AiRequestKind[];

describe('failureMessage', () => {
  describe.each(KINDS)('%s', (kind) => {
    it.each<[ContractFailure | undefined, string]>([
      ['timeout', `AI не отговори за 3 минути. ${NEXT[kind]}`],
      [
        'invalid_output',
        `AI върна отговор, който не мога да прочета. ${NEXT[kind]}`,
      ],
      ['http_500', `AI не е на разположение в момента. ${NEXT[kind]}`],
      ['http_502', `AI не е на разположение в момента. ${NEXT[kind]}`],
      [
        'stale',
        `${FAILED[kind]}: сървърът се рестартира междувременно. ${NEXT[kind]}`,
      ],
      ['aborted', `${FAILED[kind]}: заявката беше прекъсната. ${NEXT[kind]}`],
      ['error', `${FAILED[kind]}. ${NEXT[kind]}`],
      [undefined, `${FAILED[kind]}. ${NEXT[kind]}`],
    ])('%s', (error, message) => {
      expect(
        failureMessage(
          kind,
          failed(
            error,
            error === 'timeout' ? '2026-10-28T18:03:00.000Z' : undefined,
          ),
        ),
      ).toBe(message);
    });
  });

  it('за HTTP кода няма число в текста', () => {
    for (const kind of KINDS) {
      expect(failureMessage(kind, failed('http_503'))).not.toMatch(/\d/);
    }
  });

  it.each([
    ['2026-10-28T18:01:00.000Z', 'AI не отговори за 1 минута.'],
    ['2026-10-28T18:02:40.000Z', 'AI не отговори за 3 минути.'],
    ['2026-10-28T18:00:45.000Z', 'AI не отговори за 45 секунди.'],
  ])('timeout до %s: колко е чакано', (finishedAt, start) => {
    expect(failureMessage('replace', failed('timeout', finishedAt))).toMatch(
      new RegExp(`^${start}`),
    );
  });

  it('timeout без finishedAt: „не отговори навреме“', () => {
    expect(failureMessage('menu', { error: 'timeout', createdAt })).toBe(
      'AI не отговори навреме. Опитай пак или започни празно.',
    );
  });

  it('no_results при предложения и внасяне казва какво не е намерено', () => {
    expect(failureMessage('suggest', failed('no_results'))).toBe(
      'Не намерих подходящи рецепти. Опитай пак или с друга подсказка.',
    );
    expect(failureMessage('import', failed('no_results'))).toBe(
      'Не намерих рецепта в източника.',
    );
  });

  it('fetch_blocked и fetch_failed при внасяне водят към поставяне на текста', () => {
    expect(failureMessage('import', failed('fetch_blocked'))).toBe(
      'Сайтът не позволява автоматично четене — постави текста.',
    );
    expect(failureMessage('import', failed('fetch_failed'))).toBe(
      'Страницата не се отвори — постави текста.',
    );
  });

  it('код, който не е за този вид заявка, дава общото съобщение', () => {
    expect(failureMessage('menu', failed('no_results'))).toBe(
      'AI не успя да предложи меню. Опитай пак или започни празно.',
    );
    expect(failureMessage('replace', failed('fetch_failed'))).toBe(
      'AI не успя да предложи друго ястие. Опитай пак или избери сам.',
    );
  });
});
