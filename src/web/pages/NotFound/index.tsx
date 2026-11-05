import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { useNavigateTo } from '../../router';

export function NotFound() {
  const navigate = useNavigateTo();
  return (
    <div>
      <PageHeader
        eyebrow="Not found"
        title="There is no page here"
        lede="The requested page could not be located."
        actions={
          <Button type="button" onClick={() => navigate('/')}>
            Go to Home
          </Button>
        }
      />
    </div>
  );
}

export default NotFound;
