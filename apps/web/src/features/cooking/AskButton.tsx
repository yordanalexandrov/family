import { useNeedsConnection } from '../../components/NeedsConnection';
import { useOnline } from '../../lib/use-online';

/** „Питай“ в Готвене: отваря листа „Въпрос“; без връзка е изключен с „Иска връзка“. */
export function AskButton({
  open,
  onOpen,
}: {
  /** Листът „Въпрос“ е отворен. */
  open: boolean;
  onOpen: () => void;
}) {
  const connection = useNeedsConnection(useOnline(), 'cooking-steps__hint');
  return (
    <>
      <button
        type="button"
        className="button button--quiet cooking-steps__ask"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={connection.disabled}
        aria-describedby={connection.describedBy}
        onClick={onOpen}
      >
        Питай
      </button>
      {connection.hint}
    </>
  );
}
