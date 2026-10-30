export type SourceId = 'greenhouse' | 'lever' | 'ashby';
export type RemotePolicy = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship' | 'unknown';

/** A text block from a sanitised posting. Rendering is always as plain text. */
export interface TextBlock {
  type: 'heading' | 'paragraph' | 'item';
  text: string;
}

/** Salary exactly as an employer published it in structured form. Never inferred. */
export interface PublishedSalary {
  currency: string;
  min: number | null;
  max: number | null;
  interval: 'year' | 'month' | 'week' | 'day' | 'hour';
  source: 'structured';
}

/** A posting normalised from one source. Every field is taken from the source or left unknown. */
export interface NormalizedPosting {
  source: SourceId;
  board: string;
  sourceJobId: string;
  employer: string;
  title: string;
  locationText: string | null;
  remotePolicy: RemotePolicy;
  employmentType: EmploymentType;
  department: string | null;
  salary: PublishedSalary | null;
  description: TextBlock[];
  applyUrl: string | null;
  postingUrl: string | null;
  publishedAt: string | null;
  /** Facts the source did not state, so the dashboard can say so instead of guessing. */
  unresolved: string[];
}

export class SourceError extends Error {
  constructor(
    readonly kind: 'not_found' | 'rate_limited' | 'outage' | 'schema' | 'blocked',
    message: string,
  ) {
    super(message);
  }
}

export interface SourceAdapter {
  id: SourceId;
  label: string;
  /** Fetch every currently published posting on a board. Throws SourceError. */
  list(board: string, signal?: AbortSignal): Promise<NormalizedPosting[]>;
  /** Public page for a board, for linking. */
  boardUrl(board: string): string;
  /** The employer's published application form, where the ATS publishes it publicly. */
  applicationQuestions?(board: string, sourceJobId: string, signal?: AbortSignal): Promise<ApplicationQuestion[]>;
}

export interface ApplicationQuestion {
  key: string;
  label: string;
  required: boolean;
  kind: 'text' | 'long_text' | 'file' | 'choice';
  options: string[];
  voluntary: boolean;
}
