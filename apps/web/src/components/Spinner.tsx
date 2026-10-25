import './Spinner.css';

export function Spinner({ label = 'Зареждане…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner__ring" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}
