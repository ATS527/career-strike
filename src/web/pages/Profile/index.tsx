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
import { ErrorPanel, Loading } from '../../components/states';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { uploadDocument } from '../../helpers/documents';
import { ExternalLink, Link } from '../../router';
import { CURATED_MARKETS } from '../Markets';
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
          className="mb-4 text-sm font-medium text-foreground"
        >
          {saveStatus}
        </p>
      )}

      {error && <ErrorPanel message="Your profile could not be loaded." onRetry={() => void load()} />}
      {!facts && !error && <Loading label="Loading your profile workspace" />}

      {facts && (
        <nav aria-label="Profile workspace quick navigation" className="flex flex-wrap gap-2 mb-6">
          <a
            href="#overview-section"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
          >
            Overview
          </a>
          <a
            href="#links-section"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
          >
            Links
          </a>
          <a
            href="#profile-role"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
          >
            Experience ({facts.filter((f) => f.kind === 'role' && f.approved).length})
          </a>
          <a
            href="#profile-skill"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
          >
            Skills ({facts.filter((f) => f.kind === 'skill' && f.approved).length})
          </a>
          <a
            href="#evidence-title"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
          >
            Projects & Evidence ({evidence?.length ?? 0})
          </a>
          <a
            href="#documents"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
          >
            Documents ({documents.length})
          </a>
          <a
            href="#linkedin-import"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
          >
            Import Export
          </a>
        </nav>
      )}

      {facts && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.75fr)_minmax(290px,0.95fr)] gap-6 items-start">
          {/* Main Left Column (2/3) */}
          <div className="flex flex-col gap-6">
            {/* 1. Professional Overview Profile Card */}
            <section
              className="rounded-xl border border-border bg-card p-6 shadow-xs"
              id="overview-section"
              aria-labelledby="overview-heading"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 id="overview-heading" className="text-lg font-semibold tracking-tight text-foreground">
                    Professional overview
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Your candidate identity, headline, and core engineering summary.
                  </p>
                </div>
                <Badge variant="teal">Verified profile</Badge>
              </div>

              {/* Dignified Profile Hero */}
              <div className="workspace-hero flex items-center gap-5">
                <div
                  className="workspace-avatar w-16 h-16 rounded-xl bg-muted/60 text-primary border border-border flex items-center justify-center font-bold text-xl shrink-0"
                  aria-label="Candidate avatar"
                >
                  {getInitials(fullName)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold tracking-tight text-foreground mb-1">
                    {fullName.trim() || 'Your Name'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {headline.trim() || 'Add a professional headline below'}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/60 border border-border text-xs font-medium text-secondary-foreground">
                      📍 {candidateCountry ? `Country: ${candidateCountry}` : 'Location unconfirmed'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-500/10 border border-teal-500/30 text-xs font-medium text-teal-700 dark:text-teal-300">
                      Open to relocation
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/60 border border-border text-xs font-medium text-secondary-foreground">
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
              <div className="mt-5">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {summary.trim() ||
                    'No professional summary added yet. Click edit overview below to describe your engineering background, systems delivered, and current focus.'}
                </p>
              </div>

              {/* Structured Edit Form */}
              <div className="border-t border-border mt-6 pt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="candidate-fullname" className="block text-xs font-medium text-foreground">
                      Full name
                    </label>
                    <input
                      id="candidate-fullname"
                      type="text"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Sarah Chen"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="candidate-headline" className="block text-xs font-medium text-foreground">
                      Professional headline
                    </label>
                    <input
                      id="candidate-headline"
                      type="text"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder="e.g. Staff Platform Architect · Distributed Systems & Cloud Infrastructure"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="candidate-summary" className="block text-xs font-medium text-foreground">
                    About you
                  </label>
                  <textarea
                    id="candidate-summary"
                    rows={4}
                    className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Summarize your engineering background, key systems delivered, and what you are looking for next."
                  />
                  <span className="block text-xs text-muted-foreground mt-1">
                    Only confirmed information is shared with employers or approved AI assistants.
                  </span>
                </div>

                <div className="flex gap-3 items-center pt-2">
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
                    <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">● Unsaved changes</span>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Professional Links Profile Card */}
            <section
              className="rounded-xl border border-border bg-card p-6 shadow-xs"
              id="links-section"
              aria-labelledby="links-heading"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 id="links-heading" className="text-lg font-semibold tracking-tight text-foreground">
                    Professional links
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Recruiter-verifiable portfolios, repositories, and professional profiles.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/60 border border-border text-xs font-medium text-secondary-foreground">
                  External evidence
                </span>
              </div>

              {/* View Mode Links */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/40 border border-border">
                  <div>
                    <strong className="text-sm text-foreground">LinkedIn: </strong>
                    {linkedinUrl.trim() ? (
                      <span className="text-sm text-muted-foreground">{linkedinUrl}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Not provided</span>
                    )}
                  </div>
                  {linkedinUrl.trim() && validLinkedin(linkedinUrl.trim()) && (
                    <div className="flex gap-2 items-center">
                      <Badge variant="teal">✓ Valid URL syntax</Badge>
                      <ExternalLink
                        href={linkedinUrl.trim()}
                        className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-2.5 py-1 transition-colors"
                      >
                        Open profile ↗
                      </ExternalLink>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40 border border-border">
                    <strong className="text-xs font-semibold text-foreground block mb-1">GitHub</strong>
                    {githubUrl.trim() ? (
                      <ExternalLink href={githubUrl.trim()} className="text-xs text-primary hover:underline">
                        {githubUrl} ↗
                      </ExternalLink>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Not provided</span>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-muted/40 border border-border">
                    <strong className="text-xs font-semibold text-foreground block mb-1">Portfolio</strong>
                    {portfolioUrl.trim() ? (
                      <ExternalLink href={portfolioUrl.trim()} className="text-xs text-primary hover:underline">
                        {portfolioUrl} ↗
                      </ExternalLink>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Not provided</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Mode Links Form */}
              <div className="border-t border-border mt-5 pt-4 space-y-4">
                <div className="space-y-1">
                  <label htmlFor="candidate-linkedin" className="block text-xs font-medium text-foreground">
                    LinkedIn profile address
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      id="candidate-linkedin"
                      type="url"
                      className="flex h-9 flex-1 min-w-[240px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <span className="block text-xs text-muted-foreground mt-1">
                    URL validation only; importing profile history requires an authorized export below.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="candidate-github" className="block text-xs font-medium text-foreground">
                      GitHub profile
                    </label>
                    <input
                      id="candidate-github"
                      type="url"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/username"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="candidate-portfolio" className="block text-xs font-medium text-foreground">
                      Portfolio or personal website
                    </label>
                    <input
                      id="candidate-portfolio"
                      type="url"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
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
          <div className="flex flex-col gap-6">
            {/* 1. Actionable Profile Readiness Card */}
            <section
              className="rounded-xl border border-border bg-card p-5 shadow-xs"
              aria-labelledby="profile-readiness-heading"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 id="profile-readiness-heading" className="text-base font-semibold tracking-tight text-foreground">
                    Profile readiness
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Grounded verification requirements for matching and applications.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 my-4">
                <div className="p-3 rounded-lg bg-muted/40 border border-border">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground block mb-1">
                    Job Matching
                  </span>
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <span className="text-teal-600 dark:text-teal-400 font-bold">✓</span>{' '}
                    {facts &&
                    facts.some((f) => f.kind === 'role' && f.approved) &&
                    facts.some((f) => f.kind === 'skill' && f.approved)
                      ? 'Ready'
                      : 'Roles & skills needed'}
                  </span>
                  <span className="text-xs text-muted-foreground block mt-1">
                    {facts
                      ? `${facts.filter((f) => f.kind === 'role' && f.approved).length} roles, ${facts.filter((f) => f.kind === 'skill' && f.approved).length} skills confirmed`
                      : '0 confirmed'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-muted/40 border border-border">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground block mb-1">
                    Applications
                  </span>
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {savedSettings['identity.email'] ? (
                      <span className="text-teal-600 dark:text-teal-400 font-bold">✓ Ready</span>
                    ) : (
                      <span className="text-amber-800 dark:text-amber-300 font-bold">○ Contact needed</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground block mt-1">
                    {savedSettings['identity.email'] ? 'Contact details ready' : 'Add email in settings to apply'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-start gap-2.5 text-xs py-2 border-b border-border/60 leading-relaxed text-foreground">
                  <span
                    className={
                      fullName.trim() && headline.trim()
                        ? 'text-teal-600 dark:text-teal-400 font-bold'
                        : 'text-amber-800 dark:text-amber-300 font-bold'
                    }
                  >
                    {fullName.trim() && headline.trim() ? '✓' : '○'}
                  </span>
                  <span>
                    {fullName.trim() && headline.trim()
                      ? 'Core identity & professional headline provided'
                      : 'Add full name and professional headline · Identifies your profile'}
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs py-2 border-b border-border/60 leading-relaxed text-foreground">
                  <span
                    className={
                      targetCountries.length > 0
                        ? 'text-teal-600 dark:text-teal-400 font-bold'
                        : 'text-amber-800 dark:text-amber-300 font-bold'
                    }
                  >
                    {targetCountries.length > 0 ? '✓' : '○'}
                  </span>
                  <span>
                    {targetCountries.length > 0
                      ? `${targetCountries.length} target hiring market(s) selected`
                      : 'Choose international target markets · Focuses discovery'}
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs py-2 border-b border-border/60 leading-relaxed text-foreground">
                  <span
                    className={
                      documents.length > 0
                        ? 'text-teal-600 dark:text-teal-400 font-bold'
                        : 'text-amber-800 dark:text-amber-300 font-bold'
                    }
                  >
                    {documents.length > 0 ? '✓' : '○'}
                  </span>
                  <span>
                    {documents.length > 0
                      ? `${documents.length} document(s) in private vault`
                      : 'Upload a résumé · Grounds fact extraction without scraping'}
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs py-2 border-b border-border/60 leading-relaxed text-foreground">
                  <span
                    className={
                      linkedinUrl.trim() || githubUrl.trim()
                        ? 'text-teal-600 dark:text-teal-400 font-bold'
                        : 'text-amber-800 dark:text-amber-300 font-bold'
                    }
                  >
                    {linkedinUrl.trim() || githubUrl.trim() ? '✓' : '○'}
                  </span>
                  <span>
                    {linkedinUrl.trim() || githubUrl.trim()
                      ? 'Professional links added'
                      : 'Add LinkedIn or GitHub profile address · Provides recruiter verification'}
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs py-2 leading-relaxed text-foreground">
                  <span
                    className={
                      facts.some((f) => f.kind === 'role' && f.approved)
                        ? 'text-teal-600 dark:text-teal-400 font-bold'
                        : 'text-amber-800 dark:text-amber-300 font-bold'
                    }
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
            <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100 p-5 shadow-md border border-slate-700/60">
              <h3 className="text-base font-semibold text-white mb-1.5">Actionable recommendation</h3>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">{nextActionAdvice.text}</p>
              {nextActionAdvice.btnHref.startsWith('#') ? (
                <a
                  href={nextActionAdvice.btnHref}
                  className="inline-flex items-center justify-center rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 shadow-xs"
                >
                  {nextActionAdvice.btnText}
                </a>
              ) : (
                <Link
                  href={nextActionAdvice.btnHref}
                  className="inline-flex items-center justify-center rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 shadow-xs"
                >
                  {nextActionAdvice.btnText}
                </Link>
              )}
            </div>

            {/* 3. Career Preferences Card */}
            <section
              className="rounded-xl border border-border bg-card p-6 shadow-xs"
              aria-labelledby="preferences-card-heading"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 id="preferences-card-heading" className="text-base font-semibold tracking-tight text-foreground">
                  Career preferences
                </h2>
              </div>

              <div className="flex flex-col gap-4">
                <div className="space-y-1">
                  <label htmlFor="pref-roles-select" className="block text-xs font-medium text-foreground">
                    Target role
                  </label>
                  <select
                    id="pref-roles-select"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

                <div className="space-y-1">
                  <label htmlFor="pref-workmode-select" className="block text-xs font-medium text-foreground">
                    Working arrangement
                  </label>
                  <select
                    id="pref-workmode-select"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

                <div className="space-y-1">
                  <label htmlFor="pref-auth-select" className="block text-xs font-medium text-foreground">
                    Work authorization situation
                  </label>
                  <select
                    id="pref-auth-select"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <span className="text-xs font-semibold text-foreground block mb-2">Target countries</span>
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {targetCountries.length === 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/60 border border-border text-xs font-medium text-secondary-foreground">
                        No markets selected yet
                      </span>
                    ) : (
                      targetCountries.map((c) => {
                        const market = CURATED_MARKETS.find((m) => m.code === c);
                        return (
                          <span
                            key={c}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-500/10 border border-teal-500/30 text-xs font-medium text-teal-700 dark:text-teal-300"
                          >
                            {market ? `${market.flag} ${market.name}` : c}
                          </span>
                        );
                      })
                    )}
                  </div>
                  <Link
                    href="/markets"
                    className="inline-flex w-full items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-2 transition-colors text-center"
                  >
                    Explore markets →
                  </Link>
                </div>
              </div>
            </section>

            {/* 4. Privacy Notice Card */}
            <div className="text-xs text-muted-foreground bg-card border border-border rounded-xl p-4 leading-relaxed">
              <strong className="text-foreground block mb-1">Privacy first.</strong>
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
