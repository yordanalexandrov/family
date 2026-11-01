/**
 * Гласовите команди (GLOSSARY: Гласова команда) в Готвене и думите за всяка: една таблица за разпознаването и за
 * надписа на изпълнената команда (първата дума).
 */
const COMMAND_WORDS = {
  next: ['напред', 'следваща'],
  previous: ['назад', 'предишна'],
  read: ['прочети', 'повтори'],
  stop: ['спри', 'стоп'],
} as const;

/** Гласова команда (GLOSSARY) в Готвене. */
export type VoiceCommand = keyof typeof COMMAND_WORDS;

/** Фраза с повече думи се пренебрегва: разговорът в кухнята не сменя стъпката. */
const MAX_WORDS = 3;

const COMMANDS = new Map<string, VoiceCommand>(
  Object.entries(COMMAND_WORDS).flatMap(([command, words]) =>
    words.map((word) => [word, command as VoiceCommand] as const),
  ),
);

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

/** Как се показва изпълнената команда: първата ѝ дума с главна буква („Напред“, „Спри“). */
export function commandLabel(command: VoiceCommand): string {
  const [word] = COMMAND_WORDS[command];
  return word.charAt(0).toUpperCase() + word.slice(1);
}
