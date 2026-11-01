import { describe, expect, it } from 'vitest';
import { voiceCommand } from './voice-command';

describe('voiceCommand', () => {
  it.each([
    ['напред', 'next'],
    ['следваща', 'next'],
    ['назад', 'previous'],
    ['предишна', 'previous'],
    ['прочети', 'read'],
    ['повтори', 'read'],
    ['спри', 'stop'],
    ['стоп', 'stop'],
  ] as const)('„%s“ → %s', (phrase, command) => {
    expect(voiceCommand(phrase)).toBe(command);
  });

  it.each([
    ['Напред', 'next'],
    ['НАЗАД!', 'previous'],
    ['Прочети.', 'read'],
    ['  стоп, ', 'stop'],
    ['„Следваща“?', 'next'],
  ] as const)(
    'главните букви, пунктуацията и интервалите не пречат: „%s“ → %s',
    (phrase, command) => {
      expect(voiceCommand(phrase)).toBe(command);
    },
  );

  it.each([
    ['хайде напред', 'next'],
    ['спри го веднага', 'stop'],
    ['ок, прочети пак', 'read'],
  ] as const)('до 3 думи с команда: „%s“ → %s', (phrase, command) => {
    expect(voiceCommand(phrase)).toBe(command);
  });

  it.each([
    'мисля, че трябва да мина напред',
    'спри се малко и прочети пак',
    'кажи на мама да спре',
  ])('фраза с повече от 3 думи се пренебрегва: „%s“', (phrase) => {
    expect(voiceCommand(phrase)).toBeNull();
  });

  it.each(['здравей', 'напредък', 'стопли', 'спре', '', '   ', 'назадничав'])(
    'непозната дума не е команда: „%s“',
    (phrase) => {
      expect(voiceCommand(phrase)).toBeNull();
    },
  );
});
