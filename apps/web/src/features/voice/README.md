# voice — глас в Готвене

## Overview
Гласово управление в Готвене: четене на глас през `SpeechSynthesis`, слушане на команди през `SpeechRecognition` и чисти функции за разпознаване на команди и разгъване на съкращения. Всичко става в браузъра; разпознатият текст не се пази и не се логва.

## Interface
- `use-read-aloud.ts:useReadAloud`, `ReadAloud` — `available`, `speaking`, `read(text)`, `stop()`
- `use-listening.ts:useListening`, `Listening` — `available`, `on`, `listening`, `error`, `toggle`; вторият параметър `paused` спира слушането, без да го изключва (`listening = on && !paused`), напр. при фокус в текстово поле
- `voice-command.ts:voiceCommand`, `VoiceCommand`, `commandLabel` — фраза → `next | previous | read | stop`
- `spoken-text.ts:spokenText` — „15 мин“ → „15 минути“, „180°C“ → „180 градуса“

## Invariants
- `voice-command.ts:MAX_WORDS` — фраза с повече от 3 думи не е команда; думата трябва да е цяла
- `use-listening.ts:useListening` — `bg-BG`, `continuous`, само финални резултати; рестартира се при край, докато е включено; `no-speech` и `aborted` не го спират
- `use-read-aloud.ts:useReadAloud` — налично е само при български глас; всяко четене прекъсва предишното; размонтирането спира четенето

## Side Effects
- `use-read-aloud.ts:useReadAloud` — `window.speechSynthesis` (`speak`, `cancel`, `getVoices`, `voiceschanged`); `logger.warn` с кода на грешката, освен `interrupted`/`canceled`
- `use-listening.ts:useListening` — `SpeechRecognition`/`webkitSpeechRecognition` (микрофон); `logger.warn` с кода на непозната грешка или с изключението от неуспешно `start()`; без разпознат текст

## Verification
- Run: `pnpm --filter web test src/features/voice`
