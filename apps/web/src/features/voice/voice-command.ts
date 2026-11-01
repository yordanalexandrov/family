/** Гласова команда (GLOSSARY) в Готвене. */
export type VoiceCommand = 'next' | 'previous' | 'read' | 'stop';

/** Фраза с повече думи се пренебрегва: разговорът в кухнята не сменя стъпката. */
const MAX_WORDS = 3;

const COMMANDS = new Map<string, VoiceCommand>([
  ['напред', 'next'],
  ['следваща', 'next'],
  ['назад', 'previous'],
  ['предишна', 'previous'],
  ['прочети', 'read'],
  ['повтори', 'read'],
  ['спри', 'stop'],
  ['стоп', 'stop'],
]);

/**
 * Разпознатата фраза → гласовата команда в нея или `null`. Главните букви и пунктуацията не пречат; думата трябва да е
 * цялата („напредък“ не е „напред“), а фраза с повече от 3 думи не е команда.
 */
export function voiceCommand(phrase: string): VoiceCommand | null {
  const words = phrase
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
  if (words.length > MAX_WORDS) {
    return null;
  }
  for (const word of words) {
    const command = COMMANDS.get(word);
    if (command) {
      return command;
    }
  }
  return null;
}
