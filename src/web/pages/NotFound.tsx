import { useNavigateTo } from '../router';

export function NotFound() {
  const navigate = useNavigateTo();
  return (
    <div className="page-head">
      <p className="eyebrow">Not found</p>
      <h1>There is no page here</h1>
      <button type="button" onClick={() => navigate('/')}>
        Go to Home
      </button>
    </div>
  );
}
