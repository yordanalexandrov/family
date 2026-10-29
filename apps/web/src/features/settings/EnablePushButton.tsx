import { useEnablePush } from './push';
import './EnablePushButton.css';

interface EnablePushButtonProps {
  /** VAPID ключът от `usePushDevice()` в състояние `off`. */
  publicKey: string;
  /** Устройството е абонирано и api-то е записало абонамента. Не се вика при отказ в браузъра. */
  onEnabled: () => void;
  onError: (error: unknown) => void;
  label?: string;
}

/**
 * Включване на известията на устройството: докато абонирането чака (FCM отнема до 26 s), бутонът е „Включване…“ със
 * спинер и е изключен; при грешка се връща в началния вид.
 */
export function EnablePushButton({
  publicKey,
  onEnabled,
  onError,
  label = 'Включи известия на това устройство',
}: EnablePushButtonProps) {
  const enable = useEnablePush({ onEnabled, onError });

  return (
    <button
      type="button"
      className="button enable-push"
      disabled={enable.isPending}
      aria-busy={enable.isPending || undefined}
      onClick={() => enable.mutate(publicKey)}
    >
      {enable.isPending ? (
        <>
          <span className="enable-push__spinner" aria-hidden="true" />
          Включване…
        </>
      ) : (
        label
      )}
    </button>
  );
}
