import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type FactKind,
  type LinkedInImportResult,
  type ProfileEvidence,
  type ProfileFact,
  type ProfileReadinessReport,
  type StoredDocument,
  type ValidationIssue,
} from '../api';
import { formatDate } from '../format';
import { ExternalLink, Link } from '../router';
import { uploadDocument } from './ApplicationPage';
import { CURATED_MARKETS } from './Markets';
import { ErrorPanel, Loading } from './states';

type FieldSpec = {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  required?: boolean;
  options?: [string, string][];
  hint?: string;
};

const SECTIONS: {
  kind: FactKind;
  title: string;
  intro: string;
  fields: FieldSpec[];
  describe: (v: Record<string, unknown>) => string;
}[] = [
  {
    kind: 'skill',
    title: 'Skills',
    intro: 'Demonstrated skills grounded in past projects and code. Names like “k8s” resolve canonically as “Kubernetes”.',
    fields: [
      { name: 'name', label: 'Skill', type: 'text', required: true },
      { name: 'years', label: 'Years using it', type: 'number' },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        options: [
          ['', '—'],
          ['familiar', 'Familiar'],
          ['proficient', 'Proficient'],
          ['expert', 'Expert'],
        ],
      },
    ],
    describe: (v) => [v.name, v.years != null ? `${String(v.years)} yrs` : null, v.level].filter(Boolean).join(' · '),
  },
  {
    kind: 'role',
    title: 'Experience',
    intro: 'Past and current employment history. Overlapping tenures are counted once for total experience calculation.',
    fields: [
      { name: 'title', label: 'Job title', type: 'text', required: true },
      { name: 'employer', label: 'Employer', type: 'text' },
      { name: 'startYear', label: 'Start year', type: 'number', required: true },
      { name: 'endYear', label: 'End year', type: 'number', hint: 'Leave empty if current' },
    ],
    describe: (v) => `${String(v.title)}${v.employer ? ` at ${String(v.employer)}` : ''} · ${String(v.startYear)}–${v.endYear ?? 'now'}`,
  },
  {
    kind: 'education',
    title: 'Education',
    intro: 'Academic credentials and degrees.',
    fields: [
      { name: 'qualification', label: 'Qualification', type: 'text', required: true },
      { name: 'institution', label: 'Institution', type: 'text' },
      { name: 'year', label: 'Year', type: 'number' },
    ],
    describe: (v) => [v.qualification, v.institution, v.year].filter(Boolean).join(' · '),
  },
  {
    kind: 'certification',
    title: 'Certifications',
    intro: 'Industry certifications and professional credentials.',
    fields: [
      { name: 'name', label: 'Certification', type: 'text', required: true },
      { name: 'issuer', label: 'Issuer', type: 'text' },
      { name: 'year', label: 'Year', type: 'number' },
    ],
    describe: (v) => [v.name, v.issuer, v.year].filter(Boolean).join(' · '),
  },
  {
    kind: 'language',
    title: 'Languages',
    intro: 'Languages used for international communication and local engineering delivery.',
    fields: [
      { name: 'name', label: 'Language', type: 'text', required: true },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        required: true,
        options: [
          ['professional', 'Professional'],
          ['native', 'Native'],
          ['basic', 'Basic'],
        ],
      },
    ],
    describe: (v) => `${String(v.name)} · ${String(v.level)}`,
  },
];

function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return 'SC';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function validLinkedin(s: string): boolean {
  try {
    const u = new URL(s);
    return (
      u.protocol === 'https:' &&
      ['linkedin.com', 'www.linkedin.com'].includes(u.hostname) &&
      /^\/in\/[^/?#]+\/?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function Profile() {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [evidence, setEvidence] = useState<ProfileEvidence[] | null>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [readiness, setReadiness] = useState<ProfileReadinessReport | null>(null);
  const [savedSettings, setSavedSettings] = useState<Record<string, unknown>>({});
  const [error, setError] = useState(false);

  // Editable candidate fields
  const [fullName, setFullName] = useState('');
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');

  // Preferences
  const [preferredRoles, setPreferredRoles] = useState<string[]>([]);
  const [remotePref, setRemotePref] = useState('remote_only');
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [authSituation, setAuthSituation] = useState<'unknown' | 'sponsor' | 'existing'>('unknown');

  // Status & saving
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const resumeFileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [profileRes, settingsRes, readinessRes, docsRes] = await Promise.all([
        api<{ facts: ProfileFact[]; evidence: ProfileEvidence[] }>('/api/profile'),
        api<{ settings: Record<string, unknown> }>('/api/settings').catch(() => null),
        api<{ readiness: ProfileReadinessReport }>('/api/profile/readiness').catch(() => null),
        api<{ documents: StoredDocument[] }>('/api/documents').catch(() => null),
      ]);

      setFacts(profileRes.facts);
      setEvidence(profileRes.evidence);
      if (docsRes?.documents) setDocuments(docsRes.documents);

      if (settingsRes?.settings) {
        const s = settingsRes.settings;
        setSavedSettings(s);
        const nameVal = typeof s['identity.fullName'] === 'string' ? s['identity.fullName'] : '';
        const headVal = typeof s['identity.headline'] === 'string' ? s['identity.headline'] : '';
        const sumVal = typeof s['identity.summary'] === 'string' ? s['identity.summary'] : '';
        const liVal = typeof s['candidate.linkedinUrl'] === 'string' ? s['candidate.linkedinUrl'] : '';
        const ghVal = typeof s['candidate.githubUrl'] === 'string' ? s['candidate.githubUrl'] : '';
        const pfVal = typeof s['candidate.portfolioUrl'] === 'string' ? s['candidate.portfolioUrl'] : '';

        setFullName(nameVal);
        setHeadline(headVal);
        setSummary(sumVal);
        setLinkedinUrl(liVal);
        setGithubUrl(ghVal);
        setPortfolioUrl(pfVal);

        if (Array.isArray(s['search.preferredRoles'])) {
          setPreferredRoles(s['search.preferredRoles'].map(String));
        }
        if (typeof s['search.remotePreference'] === 'string') {
          setRemotePref(s['search.remotePreference']);
        }
        if (Array.isArray(s['search.preferredCountries'])) {
          setTargetCountries(s['search.preferredCountries'].map(String));
        }
        const auths = (s['candidate.workAuthorizations'] as Record<string, string> | undefined) ?? {};
        const values = Object.values(auths);
        if (values.includes('needs_sponsorship')) setAuthSituation('sponsor');
        else if (values.includes('authorised')) setAuthSituation('existing');
        else setAuthSituation('unknown');
      }

      if (readinessRes?.readiness) {
        setReadiness(readinessRes.readiness);
      }
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(() => {
    const s = savedSettings;
    return (
      fullName !== (typeof s['identity.fullName'] === 'string' ? s['identity.fullName'] : '') ||
      headline !== (typeof s['identity.headline'] === 'string' ? s['identity.headline'] : '') ||
      summary !== (typeof s['identity.summary'] === 'string' ? s['identity.summary'] : '') ||
      linkedinUrl !== (typeof s['candidate.linkedinUrl'] === 'string' ? s['candidate.linkedinUrl'] : '') ||
      githubUrl !== (typeof s['candidate.githubUrl'] === 'string' ? s['candidate.githubUrl'] : '') ||
      portfolioUrl !== (typeof s['candidate.portfolioUrl'] === 'string' ? s['candidate.portfolioUrl'] : '')
    );
  }, [fullName, headline, summary, linkedinUrl, githubUrl, portfolioUrl, savedSettings]);

  const saveProfileDraft = async () => {
    setIsSaving(true);
    setSaveStatus('Saving profile...');
    try {
      const updates: [string, unknown][] = [
        ['identity.fullName', fullName.trim() || null],
        ['identity.headline', headline.trim() || null],
        ['identity.summary', summary.trim() || null],
        ['candidate.linkedinUrl', linkedinUrl.trim() || null],
        ['candidate.githubUrl', githubUrl.trim() || null],
        ['candidate.portfolioUrl', portfolioUrl.trim() || null],
      ];

      for (const [key, value] of updates) {
        await api(`/api/settings/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: { value },
        });
      }

      setSaveStatus('All profile changes saved.');
      await load();
    } catch (err) {
      setSaveStatus(err instanceof ApiError ? 'Could not save some profile fields. Check values and retry.' : 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePreference = async (key: string, value: unknown) => {
    try {
      await api(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: { value },
      });
      await load();
    } catch {
      setSaveStatus('Could not update preference.');
    }
  };

  const candidateCountry = typeof savedSettings['candidate.country'] === 'string' ? savedSettings['candidate.country'] : null;

  const nextActionAdvice = useMemo(() => {
    if (targetCountries.length === 0) {
      return {
        text: 'Choose your international target hiring markets to align opportunity recommendations.',
        btnText: 'Explore matching markets ↗',
        btnHref: '/markets',
      };
    }
    if (!linkedinUrl.trim() && documents.length === 0) {
      return {
        text: 'Attach a résumé document or add your LinkedIn URL to ground your candidate evidence.',
        btnText: 'Upload résumé document ↗',
        btnHref: '#documents',
      };
    }
    if (facts && facts.some((f) => !f.approved)) {
      return {
        text: 'Confirm or discard your extracted skills and experience below to unlock verified matches.',
        btnText: 'Review imported facts ↗',
        btnHref: '#profile-role',
      };
    }
    return {
      text: 'Your dossier is grounded and verified. Discover verified opportunities across your target markets.',
      btnText: 'Explore open opportunities ↗',
      btnHref: '/opportunities',
    };
  }, [targetCountries, linkedinUrl, documents, facts]);

  return (
    <>
      <div className="page-head" style={{ marginBottom: '1.25rem' }}>
        <p className="eyebrow">Professional identity</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>Your career profile</h1>
            <p className="lede" style={{ maxWidth: '75ch' }}>
              One verified professional dossier powering job discovery, tailored applications, and approved AI assistants.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              ref={resumeFileRef}
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSaveStatus(await uploadDocument(file, 'resume'));
                e.target.value = '';
                void load();
              }}
            />
            <button
              type="button"
              className="button button--quiet"
              onClick={() => resumeFileRef.current?.click()}
            >
              ↑ Import resume
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={isSaving}
              onClick={() => void saveProfileDraft()}
            >
              {isSaving ? 'Saving...' : 'Save profile draft'}
            </button>
          </div>
        </div>
      </div>

      {saveStatus && (
        <p role="status" aria-live="polite" data-testid="profile-save-status" className="save-status" style={{ marginBottom: '1rem' }}>
          {saveStatus}
        </p>
      )}

      {error && <ErrorPanel message="Your profile could not be loaded." onRetry={() => void load()} />}
      {!facts && !error && <Loading label="Loading your profile workspace" />}

      {facts && (
        <nav aria-label="Profile workspace quick navigation" style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <a href="#overview-section" className="button button--quiet">Overview</a>
          <a href="#links-section" className="button button--quiet">Links</a>
          <a href="#profile-role" className="button button--quiet">Experience ({facts.filter((f) => f.kind === 'role' && f.approved).length})</a>
          <a href="#profile-skill" className="button button--quiet">Skills ({facts.filter((f) => f.kind === 'skill' && f.approved).length})</a>
          <a href="#evidence-title" className="button button--quiet">Projects & Evidence ({evidence?.length ?? 0})</a>
          <a href="#documents" className="button button--quiet">Documents ({documents.length})</a>
          <a href="#linkedin-import" className="button button--quiet">Import Export</a>
        </nav>
      )}

      {facts && (
        <div className="candidate-workspace-layout">
          {/* Main Left Column (2/3) */}
          <div className="workspace-stack">
            {/* 1. Professional Overview Dossier Card */}
            <section className="dossier-card" id="overview-section" aria-labelledby="overview-heading">
              <div className="dossier-card-header">
                <div>
                  <h2 id="overview-heading">Professional overview</h2>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: 'var(--ink-soft)' }}>
                    Your candidate identity, headline, and core engineering summary.
                  </p>
                </div>
                <span className="dossier-chip dossier-chip--verified">
                  Verified dossier
                </span>
              </div>

              {/* Dignified Dossier Hero */}
              <div className="workspace-hero dossier-hero">
                <div className="workspace-avatar dossier-avatar" aria-label="Candidate avatar">
                  {getInitials(fullName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 0.25rem', fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 600 }}>
                    {fullName.trim() || 'Your Name'}
                  </h3>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.98rem', color: 'var(--ink-soft)' }}>
                    {headline.trim() || 'Add a professional headline below'}
                  </p>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span className="dossier-chip">
                      📍 {candidateCountry ? `Country: ${candidateCountry}` : 'Location unconfirmed'}
                    </span>
                    <span className="dossier-chip dossier-chip--verified">
                      Open to relocation
                    </span>
                    <span className="dossier-chip">
                      {remotePref === 'remote_only' ? 'Remote only' : remotePref === 'hybrid_ok' ? 'Remote or hybrid' : 'On-site or hybrid'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dossier Summary Narrative */}
              <div style={{ marginTop: '1.25rem' }}>
                <p style={{ margin: 0, fontSize: '0.94rem', color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {summary.trim() || 'No professional summary added yet. Click edit overview below to describe your engineering background, systems delivered, and current focus.'}
                </p>
              </div>

              {/* Structured Edit Form */}
              <div className="dossier-edit-panel" style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--rule)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div className="record__part">
                    <label htmlFor="candidate-fullname">Full name</label>
                    <input
                      id="candidate-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Sarah Chen"
                      autoComplete="name"
                    />
                  </div>
                  <div className="record__part">
                    <label htmlFor="candidate-headline">Professional headline</label>
                    <input
                      id="candidate-headline"
                      type="text"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder="e.g. Staff Platform Architect · Distributed Systems & Cloud Infrastructure"
                    />
                  </div>
                </div>

                <div className="record__part">
                  <label htmlFor="candidate-summary">About you</label>
                  <textarea
                    id="candidate-summary"
                    rows={4}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Summarize your engineering background, key systems delivered, and what you are looking for next."
                  />
                  <span className="muted field-note">
                    Only confirmed information is shared with employers or approved AI assistants.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', alignItems: 'center' }}>
                  <button type="button" className="button button--secondary" onClick={() => void saveProfileDraft()} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Apply overview changes'}
                  </button>
                  {isDirty && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--attention)', fontWeight: 500 }}>
                      ● Unsaved changes
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Professional Links Dossier Card */}
            <section className="dossier-card" id="links-section" aria-labelledby="links-heading">
              <div className="dossier-card-header">
                <div>
                  <h2 id="links-heading">Professional links</h2>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: 'var(--ink-soft)' }}>
                    Recruiter-verifiable portfolios, repositories, and professional profiles.
                  </p>
                </div>
                <span className="dossier-chip">External evidence</span>
              </div>

              {/* View Mode Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', background: 'var(--paper-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--rule)' }}>
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--ink)' }}>LinkedIn: </strong>
                    {linkedinUrl.trim() ? (
                      <span style={{ fontSize: '0.88rem', color: 'var(--ink-soft)' }}>{linkedinUrl}</span>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Not provided</span>
                    )}
                  </div>
                  {linkedinUrl.trim() && validLinkedin(linkedinUrl.trim()) && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="dossier-chip dossier-chip--verified" style={{ fontSize: '0.78rem' }}>
                        ✓ Valid URL syntax
                      </span>
                      <ExternalLink href={linkedinUrl.trim()} className="button button--quiet" style={{ fontSize: '0.82rem' }}>
                        Open profile ↗
                      </ExternalLink>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ padding: '0.65rem 0.85rem', background: 'var(--paper-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--rule)' }}>
                    <strong style={{ fontSize: '0.85rem', display: 'block', color: 'var(--ink)' }}>GitHub</strong>
                    {githubUrl.trim() ? (
                      <ExternalLink href={githubUrl.trim()} className="external-link" style={{ fontSize: '0.85rem' }}>
                        {githubUrl} ↗
                      </ExternalLink>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Not provided</span>
                    )}
                  </div>

                  <div style={{ padding: '0.65rem 0.85rem', background: 'var(--paper-subtle)', borderRadius: 'var(--radius)', border: '1px solid var(--rule)' }}>
                    <strong style={{ fontSize: '0.85rem', display: 'block', color: 'var(--ink)' }}>Portfolio</strong>
                    {portfolioUrl.trim() ? (
                      <ExternalLink href={portfolioUrl.trim()} className="external-link" style={{ fontSize: '0.85rem' }}>
                        {portfolioUrl} ↗
                      </ExternalLink>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Not provided</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Mode Links Form */}
              <div className="dossier-edit-panel" style={{ marginTop: '1.25rem', paddingTop: '1.15rem', borderTop: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="record__part">
                    <label htmlFor="candidate-linkedin">LinkedIn profile address</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <input
                        id="candidate-linkedin"
                        type="url"
                        style={{ flex: '1 1 260px' }}
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        placeholder="https://www.linkedin.com/in/your-profile"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="button button--quiet"
                        onClick={() => {
                          if (!linkedinUrl.trim()) setSaveStatus('Enter a LinkedIn URL first.');
                          else if (validLinkedin(linkedinUrl.trim())) setSaveStatus('Valid HTTPS LinkedIn profile URL format.');
                          else setSaveStatus('Use an HTTPS linkedin.com/in/your-profile URL.');
                        }}
                      >
                        Verify URL
                      </button>
                    </div>
                    <span className="muted field-note">
                      URL validation only; importing profile history requires an authorized export below.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                    <div className="record__part">
                      <label htmlFor="candidate-github">GitHub profile</label>
                      <input
                        id="candidate-github"
                        type="url"
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        placeholder="https://github.com/username"
                      />
                    </div>
                    <div className="record__part">
                      <label htmlFor="candidate-portfolio">Portfolio or personal website</label>
                      <input
                        id="candidate-portfolio"
                        type="url"
                        value={portfolioUrl}
                        onChange={(e) => setPortfolioUrl(e.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button type="button" className="button button--secondary" onClick={() => void saveProfileDraft()} disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Apply link changes'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Experience Timeline */}
            {SECTIONS.filter((s) => s.kind === 'role').map((section) => (
              <FactSection
                key={section.kind}
                section={section}
                facts={facts.filter((f) => f.kind === section.kind)}
                onChange={() => void load()}
              />
            ))}

            {/* 4. Projects & Evidence */}
            {evidence && (
              <EvidenceSection
                evidence={evidence}
                roles={facts.filter((f) => f.kind === 'role')}
                onChange={() => void load()}
              />
            )}

            {/* 5. Skills & Expertise */}
            {SECTIONS.filter((s) => s.kind === 'skill').map((section) => (
              <FactSection
                key={section.kind}
                section={section}
                facts={facts.filter((f) => f.kind === section.kind)}
                onChange={() => void load()}
              />
            ))}
            <SuggestSkills onChange={() => void load()} />

            {/* 6. Education, Certifications & Languages */}
            {SECTIONS.filter((s) => s.kind !== 'role' && s.kind !== 'skill').map((section) => (
              <FactSection
                key={section.kind}
                section={section}
                facts={facts.filter((f) => f.kind === section.kind)}
                onChange={() => void load()}
              />
            ))}

            {/* 7. Supporting Documents */}
            <Documents />

            {/* 8. LinkedIn Export Import */}
            <LinkedInImportSection onChange={() => void load()} />
          </div>

          {/* Right Sidebar Column (1/3) */}
          <div className="workspace-stack">
            {/* 1. Actionable Dossier Status Card (Replacing arbitrary 88% gamification) */}
            <section className="actionable-status-card" aria-labelledby="dossier-status-heading">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 id="dossier-status-heading" style={{ margin: 0, fontSize: '1.15rem' }}>
                    Dossier status
                  </h2>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                    Grounded verification requirements for matching and applications.
                  </p>
                </div>
              </div>

              <div className="actionable-status-pillars">
                <div className="status-pillar">
                  <span className="status-pillar__label">Job Matching</span>
                  <span className="status-pillar__state">
                    <span className="checklist-ok">✓</span> {facts && facts.some(f => f.kind === 'role' && f.approved) && facts.some(f => f.kind === 'skill' && f.approved) ? 'Ready' : 'Roles & skills needed'}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', display: 'block', marginTop: '0.2rem' }}>
                    {facts ? `${facts.filter(f => f.kind === 'role' && f.approved).length} roles, ${facts.filter(f => f.kind === 'skill' && f.approved).length} skills confirmed` : '0 confirmed'}
                  </span>
                </div>
                <div className="status-pillar">
                  <span className="status-pillar__label">Applications</span>
                  <span className="status-pillar__state">
                    {savedSettings['identity.email'] ? <span className="checklist-ok">✓ Ready</span> : <span className="checklist-warn">○ Contact needed</span>}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', display: 'block', marginTop: '0.2rem' }}>
                    {savedSettings['identity.email'] ? 'Contact details ready' : 'Add email in settings to apply'}
                  </span>
                </div>
              </div>

              <div className="actionable-checklist">
                <div className="checklist-line">
                  <span className={fullName.trim() && headline.trim() ? 'checklist-ok' : 'checklist-warn'}>
                    {fullName.trim() && headline.trim() ? '✓' : '○'}
                  </span>
                  <span>
                    {fullName.trim() && headline.trim()
                      ? 'Core identity & professional headline provided'
                      : 'Add full name and professional headline · Identifies your dossier'}
                  </span>
                </div>
                <div className="checklist-line">
                  <span className={targetCountries.length > 0 ? 'checklist-ok' : 'checklist-warn'}>
                    {targetCountries.length > 0 ? '✓' : '○'}
                  </span>
                  <span>
                    {targetCountries.length > 0
                      ? `${targetCountries.length} target hiring market(s) selected`
                      : 'Choose international target markets · Focuses discovery'}
                  </span>
                </div>
                <div className="checklist-line">
                  <span className={documents.length > 0 ? 'checklist-ok' : 'checklist-warn'}>
                    {documents.length > 0 ? '✓' : '○'}
                  </span>
                  <span>
                    {documents.length > 0
                      ? `${documents.length} document(s) in private vault`
                      : 'Upload a résumé · Grounds fact extraction without scraping'}
                  </span>
                </div>
                <div className="checklist-line">
                  <span className={linkedinUrl.trim() || githubUrl.trim() ? 'checklist-ok' : 'checklist-warn'}>
                    {linkedinUrl.trim() || githubUrl.trim() ? '✓' : '○'}
                  </span>
                  <span>
                    {linkedinUrl.trim() || githubUrl.trim()
                      ? 'Professional links added'
                      : 'Add LinkedIn or GitHub profile address · Provides recruiter verification'}
                  </span>
                </div>
                <div className="checklist-line">
                  <span className={facts.some((f) => f.kind === 'role' && f.approved) ? 'checklist-ok' : 'checklist-warn'}>
                    {facts.some((f) => f.kind === 'role' && f.approved) ? '✓' : '○'}
                  </span>
                  <span>
                    {facts.some((f) => f.kind === 'role' && f.approved)
                      ? 'Confirmed work history'
                      : 'Add and confirm past roles · Used to verify years of experience'}
                  </span>
                </div>
              </div>
            </section>

            {/* 2. Focused Action Card */}
            <div className="workspace-focus-card">
              <h3>Actionable recommendation</h3>
              <p>{nextActionAdvice.text}</p>
              {nextActionAdvice.btnHref.startsWith('#') ? (
                <a href={nextActionAdvice.btnHref} className="button">
                  {nextActionAdvice.btnText}
                </a>
              ) : (
                <Link href={nextActionAdvice.btnHref} className="button">
                  {nextActionAdvice.btnText}
                </Link>
              )}
            </div>

            {/* 3. Career Preferences Card */}
            <section className="dossier-card" aria-labelledby="preferences-card-heading">
              <div className="dossier-card-header">
                <h2 id="preferences-card-heading">Career preferences</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div className="record__part">
                  <label htmlFor="pref-roles-select">Target role</label>
                  <select
                    id="pref-roles-select"
                    value={preferredRoles[0] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? [e.target.value] : [];
                      setPreferredRoles(val);
                      void updatePreference('search.preferredRoles', val);
                    }}
                  >
                    <option value="">Choose primary target role...</option>
                    <option value="Software Engineer">Software Engineer</option>
                    <option value="Platform / Backend Engineer">Platform / Backend Engineer</option>
                    <option value="Mobile / iOS Engineer">Mobile / iOS Engineer</option>
                    <option value="AI / ML Engineer">AI / ML Engineer</option>
                    <option value="Technical Product Manager">Technical Product Manager</option>
                  </select>
                </div>

                <div className="record__part">
                  <label htmlFor="pref-workmode-select">Working arrangement</label>
                  <select
                    id="pref-workmode-select"
                    value={remotePref}
                    onChange={(e) => {
                      setRemotePref(e.target.value);
                      void updatePreference('search.remotePreference', e.target.value);
                    }}
                  >
                    <option value="remote_only">Remote only</option>
                    <option value="hybrid_ok">Remote or hybrid</option>
                    <option value="onsite_ok">Local / on-site or hybrid</option>
                  </select>
                </div>

                <div className="record__part">
                  <label htmlFor="pref-auth-select">Work authorization situation</label>
                  <select
                    id="pref-auth-select"
                    value={authSituation}
                    onChange={(e) => {
                      const val = e.target.value as typeof authSituation;
                      setAuthSituation(val);
                      const rec: Record<string, string> = {};
                      for (const c of targetCountries) {
                        rec[c] = val === 'sponsor' ? 'needs_sponsorship' : val === 'existing' ? 'authorised' : 'unknown';
                      }
                      void updatePreference('candidate.workAuthorizations', rec);
                    }}
                  >
                    <option value="unknown">Not assessed yet</option>
                    <option value="sponsor">I may need employer sponsorship</option>
                    <option value="existing">I have authorization in target markets</option>
                  </select>
                </div>

                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                    Target countries
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                    {targetCountries.length === 0 ? (
                      <span className="dossier-chip">No markets selected yet</span>
                    ) : (
                      targetCountries.map((c) => {
                        const market = CURATED_MARKETS.find((m) => m.code === c);
                        return (
                          <span key={c} className="dossier-chip dossier-chip--verified">
                            {market ? `${market.flag} ${market.name}` : c}
                          </span>
                        );
                      })
                    )}
                  </div>
                  <Link href="/markets" className="button button--quiet" style={{ width: '100%', textAlign: 'center' }}>
                    Explore markets →
                  </Link>
                </div>
              </div>
            </section>

            {/* 4. Privacy Notice Card */}
            <div
              style={{
                fontSize: '0.82rem',
                color: 'var(--ink-soft)',
                background: 'var(--canvas)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius)',
                padding: '0.9rem',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: '0.2rem' }}>
                Privacy first.
              </strong>
              In Career Strike, each AI connection receives only permitted profile fields. A resume import never silently
              overwrites verified information.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LinkedInImportSection({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    setStatus('Reading export file...');
    try {
      let body: unknown;
      if (file.name.endsWith('.zip')) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        body = { zipBase64: btoa(binary) };
      } else {
        const text = await file.text();
        body = { csvText: text, filename: file.name };
      }
      const res = await api<{ ok: boolean; result: LinkedInImportResult }>('/api/profile/import/linkedin', {
        method: 'POST',
        body,
      });
      const { imported, total, skipped } = res.result;
      if (total === 0) {
        setStatus(skipped > 0 ? `All items in ${file.name} were already in your profile.` : `No profile items found in ${file.name}.`);
      } else {
        const parts = [
          imported.roles ? `${imported.roles} role${imported.roles > 1 ? 's' : ''}` : null,
          imported.skills ? `${imported.skills} skill${imported.skills > 1 ? 's' : ''}` : null,
          imported.education ? `${imported.education} education` : null,
          imported.certifications ? `${imported.certifications} cert${imported.certifications > 1 ? 's' : ''}` : null,
          imported.languages ? `${imported.languages} language${imported.languages > 1 ? 's' : ''}` : null,
          imported.projects ? `${imported.projects} project${imported.projects > 1 ? 's' : ''}` : null,
        ].filter(Boolean);
        setStatus(`Imported ${parts.join(', ')} for your review below. Nothing is used until you approve it.`);
      }
      onChange();
    } catch (err) {
      setStatus(err instanceof ApiError ? ((err.body as { message?: string } | null)?.message ?? 'Import failed.') : 'Could not import the file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="settings-group" aria-labelledby="linkedin-import-title" id="linkedin-import">
      <h2 id="linkedin-import-title">Import from LinkedIn export</h2>
      <p className="help">
        Upload your LinkedIn data export archive (.zip) or individual CSV file (e.g. <code>Positions.csv</code>, <code>Skills.csv</code>, <code>Education.csv</code>, <code>Projects.csv</code>). Career Strike extracts facts locally on this computer; each item is suggested for your review below and is never used until you approve it.
      </p>
      <div className="fact-form">
        <div className="record__part">
          <label htmlFor="linkedin-export-file">LinkedIn export file (.zip or .csv)</label>
          <input
            id="linkedin-export-file"
            type="file"
            accept=".zip,.csv,application/zip,text/csv"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleFile(file);
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

function EvidenceSection({ evidence, roles, onChange }: { evidence: ProfileEvidence[]; roles: ProfileFact[]; onChange: () => void }) {
  const [kind, setKind] = useState<ProfileEvidence['kind']>('project');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [skills, setSkills] = useState('');
  const [url, setUrl] = useState('');
  const [roleFactId, setRoleFactId] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const value =
      kind === 'project'
        ? { name, summary: detail, skills: skills.split(',').map((s) => s.trim()).filter(Boolean), url: url || null }
        : kind === 'achievement'
          ? { text: detail, roleFactId: roleFactId || null }
          : kind === 'portfolio'
            ? { label: name, url }
            : { roleFactId, summary: detail };
    try {
      await api('/api/profile/evidence', { method: 'POST', body: { kind, value } });
      setName('');
      setDetail('');
      setSkills('');
      setUrl('');
      setRoleFactId('');
      setStatus('Saved as confirmed evidence.');
      onChange();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues?.[0]?.message ?? 'Check the fields and try again.')
          : 'Could not save evidence.';
      setStatus(message);
    }
  };

  const describe = (item: ProfileEvidence): string => {
    if (item.kind === 'project') return `${String(item.value.name)} — ${String(item.value.summary)}`;
    if (item.kind === 'achievement') return String(item.value.text);
    if (item.kind === 'portfolio') return `${String(item.value.label)} — ${String(item.value.url)}`;
    return String(item.value.summary);
  };

  return (
    <section className="settings-group" aria-labelledby="evidence-title">
      <h2 id="evidence-title">Projects and evidence</h2>
      <p className="help">Add only work, achievements, and links you can stand behind. Tailored documents use confirmed evidence, never inferred claims.</p>
      {evidence.length > 0 && (
        <ul className="fact-list">
          {evidence.map((item) => (
            <li key={item.id}>
              <span>{describe(item)}</span>
              {!item.confirmed && <span className="badge">Suggested — not used until you confirm</span>}
              {!item.confirmed && (
                <button
                  type="button"
                  onClick={async () => {
                    await api(`/api/profile/evidence/${item.id}/confirm`, { method: 'POST' });
                    setStatus(`Confirmed ${describe(item)}.`);
                    onChange();
                  }}
                >
                  Confirm<span className="visually-hidden"> evidence</span>
                </button>
              )}
              <button
                type="button"
                className="quiet"
                onClick={async () => {
                  await api(`/api/profile/evidence/${item.id}`, { method: 'DELETE' });
                  setStatus(`Removed ${describe(item)}.`);
                  onChange();
                }}
              >
                {item.confirmed ? 'Remove' : 'Discard'}
                <span className="visually-hidden"> evidence</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="fact-form" onSubmit={(event) => void submit(event)}>
        <div className="record__part">
          <label htmlFor="evidence-kind">Type</label>
          <select id="evidence-kind" value={kind} onChange={(event) => setKind(event.target.value as ProfileEvidence['kind'])}>
            <option value="project">Project</option>
            <option value="achievement">Achievement</option>
            <option value="portfolio">Portfolio or GitHub link</option>
            <option value="employment_detail">Employment detail</option>
          </select>
        </div>
        {(kind === 'project' || kind === 'portfolio') && (
          <div className="record__part">
            <label htmlFor="evidence-name">{kind === 'project' ? 'Project name' : 'Label'}</label>
            <input id="evidence-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        )}
        {(kind === 'project' || kind === 'achievement' || kind === 'employment_detail') && (
          <div className="record__part">
            <label htmlFor="evidence-detail">{kind === 'achievement' ? 'Verified achievement' : 'Description'}</label>
            <textarea id="evidence-detail" rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} />
          </div>
        )}
        {kind === 'project' && (
          <div className="record__part">
            <label htmlFor="evidence-skills">Skills used</label>
            <input id="evidence-skills" value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="TypeScript, Kubernetes" />
          </div>
        )}
        {(kind === 'project' || kind === 'portfolio') && (
          <div className="record__part">
            <label htmlFor="evidence-url">Link {kind === 'project' ? '(optional)' : ''}</label>
            <input id="evidence-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
          </div>
        )}
        {(kind === 'achievement' || kind === 'employment_detail') && (
          <div className="record__part">
            <label htmlFor="evidence-role">Related role {kind === 'achievement' ? '(optional)' : ''}</label>
            <select id="evidence-role" value={roleFactId} onChange={(event) => setRoleFactId(event.target.value)}>
              <option value="">—</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {String(role.value.title)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="fact-form__submit">
          <button type="submit">Add confirmed evidence</button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

function FactSection({ section, facts, onChange }: { section: (typeof SECTIONS)[number]; facts: ProfileFact[]; onChange: () => void }) {
  const empty = Object.fromEntries(section.fields.map((f) => [f.name, f.options && f.required ? f.options[0]![0] : '']));
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErrors({});
    const value = Object.fromEntries(
      section.fields.map((f) => {
        const raw = (form[f.name] ?? '').trim();
        if (raw === '') return [f.name, f.required ? '' : null];
        return [f.name, f.type === 'number' ? Number(raw) : raw];
      }),
    );
    try {
      await api('/api/profile/facts', { method: 'POST', body: { kind: section.kind, value } });
      setForm(empty);
      setStatus(`Added ${section.describe(value)}.`);
      onChange();
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      setErrors(Object.fromEntries(issues.map((i) => [String(i.path.at(-1) ?? 'form'), i.message])));
      setStatus(issues.length ? 'Check the highlighted fields.' : 'Could not save. Check that the service is running.');
    }
  };

  const approve = async (fact: ProfileFact): Promise<void> => {
    try {
      await api(`/api/profile/facts/${fact.id}/approve`, { method: 'POST' });
      setStatus(`Approved ${section.describe(fact.value)}.`);
      onChange();
    } catch {
      setStatus('Could not approve. Try again.');
    }
  };

  const remove = async (fact: ProfileFact): Promise<void> => {
    try {
      await api(`/api/profile/facts/${fact.id}`, { method: 'DELETE' });
      setStatus(`Removed ${section.describe(fact.value)}.`);
      onChange();
    } catch {
      setStatus('Could not remove. Try again.');
    }
  };

  const headingId = `profile-${section.kind}`;
  return (
    <section className="settings-group" aria-labelledby={headingId} data-fact-kind={section.kind}>
      <h2 id={headingId}>{section.title}</h2>
      {section.intro && <p className="help">{section.intro}</p>}
      {facts.length === 0 ? (
        <p className="empty">None added yet.</p>
      ) : (
        <>
          {facts.filter((f) => !f.approved).length > 1 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="quiet"
                onClick={async () => {
                  await api('/api/profile/facts/approve-all', { method: 'POST', body: { kind: section.kind } });
                  setStatus(`Approved all suggested ${section.title.toLowerCase()}.`);
                  onChange();
                }}
              >
                Approve all {facts.filter((f) => !f.approved).length} suggested {section.title.toLowerCase()}
              </button>
            </div>
          )}
          <ul className="fact-list">
            {facts.map((f) => (
              <li key={f.id}>
                <span>{section.describe(f.value)}</span>
                {!f.approved && <span className="badge">Suggested — not used until you approve</span>}
                {!f.approved && (
                  <button type="button" onClick={() => void approve(f)}>
                    Approve<span className="visually-hidden"> {section.describe(f.value)}</span>
                  </button>
                )}
                <button type="button" className="quiet" onClick={() => void remove(f)}>
                  {f.approved ? 'Remove' : 'Discard'}
                  <span className="visually-hidden"> {section.describe(f.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form className="fact-form" onSubmit={(e) => void submit(e)} noValidate aria-label={`Add to ${section.title.toLowerCase()}`}>
        {section.fields.map((f) => {
          const id = `${section.kind}-${f.name}`;
          return (
            <div key={f.name} className="record__part">
              <label htmlFor={id}>
                {f.label}
                {!f.required && <span className="muted"> (optional)</span>}
              </label>
              {f.type === 'select' ? (
                <select id={id} value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  {f.options!.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type={f.type}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  aria-invalid={errors[f.name] ? true : undefined}
                  aria-describedby={errors[f.name] || f.hint ? `${id}-note` : undefined}
                  autoComplete="off"
                />
              )}
              {(errors[f.name] || f.hint) && (
                <span id={`${id}-note`} className={errors[f.name] ? 'save-status--error field-note' : 'muted field-note'}>
                  {errors[f.name] ?? f.hint}
                </span>
              )}
            </div>
          );
        })}
        <div className="fact-form__submit">
          <button type="submit">Add</button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

function SuggestSkills({ onChange }: { onChange: () => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!text.trim()) {
      setStatus('Paste your résumé text first.');
      return;
    }
    try {
      const { suggested } = await api<{ suggested: ProfileFact[] }>('/api/profile/suggestions', { method: 'POST', body: { text } });
      setText('');
      setStatus(
        suggested.length === 0
          ? 'No new skills found. Add any that are missing by hand below.'
          : `${suggested.length} skill${suggested.length === 1 ? '' : 's'} suggested below. Approve the ones that are true; nothing is used until you do.`,
      );
      onChange();
    } catch {
      setStatus('Could not read the text. Check that the service is running.');
    }
  };

  return (
    <section className="settings-group" aria-labelledby="suggest-title">
      <h2 id="suggest-title">Suggest skills from your résumé</h2>
      <p className="help">
        Paste the text of your résumé. Career Strike looks for skills it recognises, on this computer, and lists them for you to
        approve or discard. The pasted text is not saved.
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="record__part">
          <label htmlFor="resume-text">Résumé text</label>
          <textarea id="resume-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field__actions">
          <button type="submit">Suggest skills</button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}

function Documents() {
  const [docs, setDocs] = useState<StoredDocument[] | null>(null);
  const [kind, setKind] = useState<'resume' | 'cover_letter' | 'other'>('resume');
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDocs((await api<{ documents: StoredDocument[] }>('/api/documents').catch(() => ({ documents: [] }))).documents);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="settings-group" aria-labelledby="documents-title" id="documents">
      <h2 id="documents-title">Documents</h2>
      <p className="help">Kept in your private vault on this computer. A file is attached to an application only when you approve that application.</p>
      {docs && docs.length === 0 && <p className="empty">No documents yet.</p>}
      {docs && docs.length > 0 && (
        <ul className="fact-list" data-testid="documents">
          {docs.map((d) => (
            <li key={d.id}>
              <span>
                {d.filename} <span className="muted">· {d.kind.replace('_', ' ')} · {Math.ceil(d.sizeBytes / 1024)} KB · added {formatDate(d.createdAt)}</span>
              </span>
              <span className="doc-actions">
                <a href={`/api/documents/${d.id}/content`} download>
                  Download<span className="visually-hidden"> {d.filename}</span>
                </a>
                <button
                  type="button"
                  className="quiet"
                  onClick={async () => {
                    await api(`/api/documents/${d.id}`, { method: 'DELETE' }).catch(() => setStatus('Could not remove.'));
                    void load();
                  }}
                >
                  Remove<span className="visually-hidden"> {d.filename}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="fact-form">
        <div className="record__part">
          <label htmlFor="doc-kind">Type</label>
          <select id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="resume">Résumé</option>
            <option value="cover_letter">Cover letter</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="record__part">
          <label htmlFor="doc-file">File (PDF, .docx or .txt, up to 10 MB)</label>
          <input
            id="doc-file"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setStatus(await uploadDocument(file, kind));
              e.target.value = '';
              void load();
            }}
          />
        </div>
      </div>
      <p role="status" aria-live="polite" className="save-status">
        {status}
      </p>
    </section>
  );
}
