export function Loading({ label }: { label: string }) {
  return (
    <p className="loading" role="status" aria-live="polite">
      {label}…
    </p>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="banner banner--danger" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
