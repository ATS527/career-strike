export function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="page-head">
      <p className="eyebrow">Not found</p>
      <h1>There is no page here</h1>
      <button type="button" onClick={onHome}>
        Go to Home
      </button>
    </div>
  );
}
