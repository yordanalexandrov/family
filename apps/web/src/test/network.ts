import { act } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Изключва връзката като телефон без мрежа: `navigator.onLine` става `false` и се праща
 * събитието `offline` (react-query спира заявките, екраните казват „Няма връзка“).
 * Връща функция, която връща връзката; викай я в `afterEach`, защото `onlineManager` е общ.
 */
export function goOffline(): () => void {
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
  return () => {
    onLine.mockRestore();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  };
}
