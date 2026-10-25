import { FAMILY_TIME_ZONE } from '@family/shared';
import { formatTime } from '../../lib/format';
import { useNow } from './use-now';

const secondsFormat = new Intl.DateTimeFormat('bg-BG', {
  second: '2-digit',
  timeZone: FAMILY_TIME_ZONE,
});

/**
 * Часовникът в ядрото. Отделен компонент с собствен таймер, за да не прерисува
 * ядрото и пръстена всяка секунда. На телефона е без секунди; kiosk/TV подават `seconds`.
 */
export function Clock({ seconds = false }: { seconds?: boolean }) {
  const now = useNow(seconds ? 1000 : 5000);
  return (
    <time className="clock" dateTime={now.toISOString()}>
      {formatTime(now)}
      {seconds && (
        <small className="clock__seconds">
          {secondsFormat.format(now).padStart(2, '0')}
        </small>
      )}
    </time>
  );
}
