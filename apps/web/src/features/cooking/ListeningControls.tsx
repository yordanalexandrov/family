import type { CookingListening } from './use-cooking-listening';

/**
 * 🎤 в инструментите на Готвене: пуска и спира слушането (`aria-pressed`). Докато слуша, пулсира, а изпълнената гласова
 * команда стои до него за кратко; грешката, която го е спряла, стои до следващото докосване. Без `SpeechRecognition` го
 * няма.
 */
export function ListenButton({ listening }: { listening: CookingListening }) {
  if (!listening.available) {
    return null;
  }
  const note = listening.error ?? listening.heard;
  return (
    <span className="cooking-listen">
      <button
        type="button"
        className={`button button--quiet cooking-steps__size cooking-listen__mic${listening.listening ? ' cooking-listen__mic--on' : ''}`}
        aria-label="Слушай"
        aria-pressed={listening.on}
        onClick={listening.toggle}
      >
        🎤
      </button>
      <span
        className={`cooking-listen__note${listening.error ? ' cooking-listen__note--error' : ''}`}
        role="status"
        aria-label="Слушане"
      >
        {note}
      </span>
    </span>
  );
}
