import { PageHeader } from '../../components/PageHeader';
import { Link } from '../../router';
import { AddJobForm } from './-components/AddJobForm';

export function AddJob() {
  return (
    <>
      <PageHeader
        eyebrow={
          <span>
            <Link href="/opportunities">Opportunities</Link> / Add a job
          </span>
        }
        title="Add a job you found"
        lede="Jobs you add are marked unverified: Career Strike will not claim they are open."
      />
      <AddJobForm />
    </>
  );
}

export default AddJob;
