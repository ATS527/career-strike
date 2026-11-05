import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  api,
  type ProfileEvidence,
  type ProfileFact,
  type ProfileReadinessReport,
  type StoredDocument,
} from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ExternalLink, Link } from '../../router';
import { uploadDocument } from '../ApplicationPage';
import { CURATED_MARKETS } from '../Markets';
import { ErrorPanel, Loading } from '../states';
import { DocumentsSection } from './-components/DocumentsSection';
import { EvidenceSection } from './-components/EvidenceSection';
import { FactSection } from './-components/FactSection';
import { LinkedInImportSection } from './-components/LinkedInImportSection';
import { SuggestSkillsSection } from './-components/SuggestSkillsSection';
import { getInitials, SECTIONS, validLinkedin } from './-helpers/profileHelpers';

export function Profile() {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [evidence, setEvidence] = useState<ProfileEvidence[] | null>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [, setReadiness] = useState<ProfileReadinessReport | null>(null);
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

      await Promise.all(
        updates.map(([key, value]) =>
          api(`/api/settings/${encodeURIComponent(key)}`, {
            method: 'PUT',
            body: { value },
          }),
        ),
      );

      setSaveStatus('All profile changes saved.');
      await load();
    } catch (err) {
      setSaveStatus(
        err instanceof ApiError ? 'Could not save some profile fields. Check values and retry.' : 'Save failed.',
      );
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

  const candidateCountry =
    typeof savedSettings['candidate.country'] === 'string' ? savedSettings['candidate.country'] : null;

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
      text: 'Your profile is grounded and verified. Discover verified opportunities across your target markets.',
      btnText: 'Explore open opportunities ↗',
      btnHref: '/opportunities',
    };
  }, [targetCountries, linkedinUrl, documents, facts]);

  return (
    <>
      <PageHeader
        eyebrow="Professional identity"
        title="Your career profile"
        lede="One verified professional profile powering job discovery, tailored applications, and approved AI assistants."
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="file"
              ref={resumeFileRef}
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSaveStatus(await uploadDocument(file, 'resume'));
                e.target.value = '';
                void load();
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => resumeFileRef.current?.click()}>
              ↑ Import resume
            </Button>
            <Button type="button" size="sm" disabled={isSaving} onClick={() => void saveProfileDraft()}>
              {isSaving ? 'Saving...' : 'Save profile draft'}
            </Button>
          </div>
        }
      />

      {saveStatus && (
        <p
          role="status"
          aria-live="polite"
          data-testid="profile-save-status"
          className="save-status mb-4 text-sm font-medium"
        >
          {saveStatus}
        </p>
      )}

      {error && <ErrorPanel message="Your profile could not be loaded." onRetry={() => void load()} />}
      {!facts && !error && <Loading label="Loading your profile workspace" />}

      {facts && (
        <nav aria-label="Profile workspace quick navigation" className="flex flex-wrap gap-2 mb-6">
          <a href="#overview-section" className="button button--quiet">
            Overview
          </a>
          <a href="#links-section" className="button button--quiet">
            Links
          </a>
          <a href="#profile-role" className="button button--quiet">
            Experience ({facts.filter((f) => f.kind === 'role' && f.approved).length})
          </a>
          <a href="#profile-skill" className="button button--quiet">
            Skills ({facts.filter((f) => f.kind === 'skill' && f.approved).length})
          </a>
          <a href="#evidence-title" className="button button--quiet">
            Projects & Evidence ({evidence?.length ?? 0})
          </a>
          <a href="#documents" className="button button--quiet">
            Documents ({documents.length})
          </a>
          <a href="#linkedin-import" className="button button--quiet">
            Import Export
          </a>
        </nav>
      )}

      {facts && (
        <div className="candidate-workspace-layout">
          {/* Main Left Column (2/3) */}
          <div className="workspace-stack">
            {/* 1. Professional Overview Profile Card */}
            <section className="profile-card" id="overview-section" aria-labelledby="overview-heading">
              <div className="profile-card-header">
                <div>
                  <h2 id="overview-heading">Professional overview</h2>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: 'var(--ink-soft)' }}>
                    Your candidate identity, headline, and core engineering summary.
                  </p>
                </div>
                <Badge variant="teal">Verified profile</Badge>
              </div>

              {/* Dignified Profile Hero */}
              <div className="workspace-hero profile-hero">
                <div className="workspace-avatar profile-avatar" aria-label="Candidate avatar">
                  {getInitials(fullName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      margin: '0 0 0.25rem',
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.35rem',
                      fontWeight: 600,
                    }}
                  >
                    {fullName.trim() || 'Your Name'}
                  </h3>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.98rem', color: 'var(--ink-soft)' }}>
                    {headline.trim() || 'Add a professional headline below'}
                  </p>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span className="evidence-chip">
                      📍 {candidateCountry ? `Country: ${candidateCountry}` : 'Location unconfirmed'}
                    </span>
                    <span className="evidence-chip evidence-chip--verified">Open to relocation</span>
                    <span className="evidence-chip">
                      {remotePref === 'remote_only'
                        ? 'Remote only'
                        : remotePref === 'hybrid_ok'
                          ? 'Remote or hybrid'
                          : 'On-site or hybrid'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Profile Summary Narrative */}
              <div style={{ marginTop: '1.25rem' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.94rem',
                    color: 'var(--ink)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {summary.trim() ||
                    'No professional summary added yet. Click edit overview below to describe your engineering background, systems delivered, and current focus.'}
                </p>
              </div>

              {/* Structured Edit Form */}
              <div
                className="profile-edit-panel"
                style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--rule)' }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void saveProfileDraft()}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Apply overview changes'}
                  </Button>
                  {isDirty && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--attention)', fontWeight: 500 }}>
                      ● Unsaved changes
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Professional Links Profile Card */}
            <section className="profile-card" id="links-section" aria-labelledby="links-heading">
              <div className="profile-card-header">
                <div>
                  <h2 id="links-heading">Professional links</h2>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: 'var(--ink-soft)' }}>
                    Recruiter-verifiable portfolios, repositories, and professional profiles.
                  </p>
                </div>
                <span className="evidence-chip">External evidence</span>
              </div>

              {/* View Mode Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--paper-subtle)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--rule)',
                  }}
                >
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
                      <Badge variant="teal" className="text-xs">
                        ✓ Valid URL syntax
                      </Badge>
                      <ExternalLink
                        href={linkedinUrl.trim()}
                        className="button button--quiet"
                        style={{ fontSize: '0.82rem' }}
                      >
                        Open profile ↗
                      </ExternalLink>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      background: 'var(--paper-subtle)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--rule)',
                    }}
                  >
                    <strong style={{ fontSize: '0.85rem', display: 'block', color: 'var(--ink)' }}>GitHub</strong>
                    {githubUrl.trim() ? (
                      <ExternalLink href={githubUrl.trim()} className="external-link" style={{ fontSize: '0.85rem' }}>
                        {githubUrl} ↗
                      </ExternalLink>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Not provided</span>
                    )}
                  </div>

                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      background: 'var(--paper-subtle)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--rule)',
                    }}
                  >
                    <strong style={{ fontSize: '0.85rem', display: 'block', color: 'var(--ink)' }}>Portfolio</strong>
                    {portfolioUrl.trim() ? (
                      <ExternalLink
                        href={portfolioUrl.trim()}
                        className="external-link"
                        style={{ fontSize: '0.85rem' }}
                      >
                        {portfolioUrl} ↗
                      </ExternalLink>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>Not provided</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Mode Links Form */}
              <div
                className="profile-edit-panel"
                style={{ marginTop: '1.25rem', paddingTop: '1.15rem', borderTop: '1px solid var(--rule)' }}
              >
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!linkedinUrl.trim()) setSaveStatus('Enter a LinkedIn URL first.');
                          else if (validLinkedin(linkedinUrl.trim()))
                            setSaveStatus('Valid HTTPS LinkedIn profile URL format.');
                          else setSaveStatus('Use an HTTPS linkedin.com/in/your-profile URL.');
                        }}
                      >
                        Verify URL
                      </Button>
                    </div>
                    <span className="muted field-note">
                      URL validation only; importing profile history requires an authorized export below.
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '1rem',
                    }}
                  >
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void saveProfileDraft()}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Apply link changes'}
                    </Button>
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
            <SuggestSkillsSection onChange={() => void load()} />

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
            <DocumentsSection />

            {/* 8. LinkedIn Export Import */}
            <LinkedInImportSection onChange={() => void load()} />
          </div>

          {/* Right Sidebar Column (1/3) */}
          <div className="workspace-stack">
            {/* 1. Actionable Profile Readiness Card */}
            <section className="actionable-status-card" aria-labelledby="profile-readiness-heading">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 id="profile-readiness-heading" style={{ margin: 0, fontSize: '1.15rem' }}>
                    Profile readiness
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
                    <span className="checklist-ok">✓</span>{' '}
                    {facts &&
                    facts.some((f) => f.kind === 'role' && f.approved) &&
                    facts.some((f) => f.kind === 'skill' && f.approved)
                      ? 'Ready'
                      : 'Roles & skills needed'}
                  </span>
                  <span
                    style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', display: 'block', marginTop: '0.2rem' }}
                  >
                    {facts
                      ? `${facts.filter((f) => f.kind === 'role' && f.approved).length} roles, ${facts.filter((f) => f.kind === 'skill' && f.approved).length} skills confirmed`
                      : '0 confirmed'}
                  </span>
                </div>
                <div className="status-pillar">
                  <span className="status-pillar__label">Applications</span>
                  <span className="status-pillar__state">
                    {savedSettings['identity.email'] ? (
                      <span className="checklist-ok">✓ Ready</span>
                    ) : (
                      <span className="checklist-warn">○ Contact needed</span>
                    )}
                  </span>
                  <span
                    style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', display: 'block', marginTop: '0.2rem' }}
                  >
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
                      : 'Add full name and professional headline · Identifies your profile'}
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
                  <span
                    className={facts.some((f) => f.kind === 'role' && f.approved) ? 'checklist-ok' : 'checklist-warn'}
                  >
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
            <section className="profile-card" aria-labelledby="preferences-card-heading">
              <div className="profile-card-header">
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
                        rec[c] =
                          val === 'sponsor' ? 'needs_sponsorship' : val === 'existing' ? 'authorised' : 'unknown';
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
                      <span className="evidence-chip">No markets selected yet</span>
                    ) : (
                      targetCountries.map((c) => {
                        const market = CURATED_MARKETS.find((m) => m.code === c);
                        return (
                          <span key={c} className="evidence-chip evidence-chip--verified">
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
              <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: '0.2rem' }}>Privacy first.</strong>
              In Career Strike, each AI connection receives only permitted profile fields. A resume import never
              silently overwrites verified information.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Profile;
