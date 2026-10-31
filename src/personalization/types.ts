export type EvidenceClassification = 'STRONG_MATCH' | 'PARTIAL_MATCH' | 'TRANSFERABLE_EXPERIENCE' | 'MISSING' | 'UNVERIFIED' | 'NOT_APPLICABLE';

export interface RequirementMatch {
  requirement: string;
  classification: EvidenceClassification;
  evidenceRefs: string[];
  explanation: string;
}

export interface DocumentVariant {
  id: string;
  kind: 'resume' | 'cover_letter';
  format: 'source_text';
  locale: string;
  content: string;
  contentHash: string;
  profileFingerprint: string;
  status: 'DRAFT' | 'CANDIDATE_EDITED' | 'APPROVED' | 'SUPERSEDED';
  basedOnVariantId: string | null;
  createdAt: string;
  evidence: RequirementMatch[];
}

export interface PersonalizationView {
  applicationId: string;
  snapshot: { id: string; completeness: 'FULL' | 'INCOMPLETE' | 'MISSING'; createdAt: string } | null;
  variants: DocumentVariant[];
  requirements: RequirementMatch[];
  stale: boolean;
  warnings: string[];
}
