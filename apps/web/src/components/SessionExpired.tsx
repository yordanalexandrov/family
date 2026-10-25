import { useEffect } from 'react';
import './SessionExpired.css';

/*
 * kiosk/TV: изтекла Cloudflare Access сесия (401/403). Целият екран е един бутон;
 * докосване или OK на дистанционното презарежда, а Cloudflare води до PIN екрана.
 */
export function SessionExpired({ tv }: { tv: boolean }) {
  useEffect(() => {
    // TV: OK работи и когато фокусът не е на бутона.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && event.target === document.body) {
        window.location.reload();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="session-expired">
      <button
        type="button"
        className="session-expired__button"
        // biome-ignore lint/a11y/noAutofocus: TV: единственото действие на екрана е под фокуса на дистанционното
        autoFocus
        onClick={() => window.location.reload()}
      >
        Сесията изтече · {tv ? 'натисни OK' : 'докосни за вход'}
      </button>
    </main>
  );
}
