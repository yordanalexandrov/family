import { useEffect, useState } from 'react';
import './Aurora.css';

/*
 * Фонът зад #root: 3–4 размазани петна в цветовете --aurora-1..4.
 * Анимира се само с transform/opacity (размазването е статично), само на full и
 * без reduced-motion; спира, докато табът е скрит (document.hidden).
 */
export function Aurora() {
  const hidden = useDocumentHidden();
  return (
    <div
      className="aurora"
      data-paused={hidden || undefined}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}
