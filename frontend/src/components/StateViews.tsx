/**
 * The three states every page shows: loading, error (with retry),
 * and empty. Plain text, no spinners or decoration.
 */

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="state">{label}</p>;
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card">
      <h2>Something went wrong</h2>
      <p>{message}</p>
      {onRetry && (
        <div className="form-row">
          <button className="btn" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}
