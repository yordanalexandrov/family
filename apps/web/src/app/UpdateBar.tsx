import { useAppUpdate } from './app-update';
import './UpdateBar.css';

/** Лента горе „Има нова версия · Обнови“, докато нова версия на приложението чака (app-update.ts). */
export function UpdateBar() {
  const { available, apply } = useAppUpdate();
  if (!available) {
    return null;
  }
  return (
    <div className="update-bar" role="status">
      <p className="update-bar__message">
        <span>Има нова версия</span>
        <button type="button" className="update-bar__action" onClick={apply}>
          Обнови
        </button>
      </p>
    </div>
  );
}
