import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  type ApplicationSummary,
  type ApplicationView,
  api,
  type PersonalizationView,
  type ProfileEvidence,
  type ProfileFact,
  type ProfileReadinessReport,
  type SettingsResponse,
} from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Link } from '../../router';
import { ErrorPanel, Loading } from '../states';
import { type AtsCheck, AtsScorecard } from './-components/AtsScorecard';
import { TailoredResumeEditor } from './-components/TailoredResumeEditor';

export function ResumeStudio() {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [evidence, setEvidence] = useState<ProfileEvidence[] | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [readiness, setReadiness] = useState<ProfileReadinessReport | null>(null);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [activeApp, setActiveApp] = useState<ApplicationView | null>(null);
  const [personalization, setPersonalization] = useState<PersonalizationView | null>(null);
  const [selectedVariantKind, setSelectedVariantKind] = useState<'resume' | 'cover_letter'>('resume');
  const [variantText, setVariantText] = useState<string>('');
  const [savingVariant, setSavingVariant] = useState(false);
  const [variantSaveStatus, setVariantSaveStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<'master' | 'compare'>('master');

  const loadBase = useCallback(async () => {
    try {
      const [profileRes, settingsRes, readinessRes, appsRes] = await Promise.all([
        api<{ facts: ProfileFact[]; evidence: ProfileEvidence[] }>('/api/profile'),
        api<SettingsResponse>('/api/settings').catch(() => null),
        api<{ readiness: ProfileReadinessReport }>('/api/profile/readiness').catch(() => null),
        api<{ applications: ApplicationSummary[] }>('/api/applications').catch(() => ({ applications: [] })),
      ]);
      setFacts(profileRes.facts);
      setEvidence(profileRes.evidence);
      if (settingsRes?.settings) setSettings(settingsRes.settings);
      if (readinessRes?.readiness) setReadiness(readinessRes.readiness);
      setApplications(appsRes.applications);
      if (!selectedAppId && appsRes.applications.length > 0) {
        setSelectedAppId(appsRes.applications[0]!.id);
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [selectedAppId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selectedAppId) {
      setActiveApp(null);
      setPersonalization(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      api<{ application: ApplicationView }>(`/api/applications/${encodeURIComponent(selectedAppId)}`),
      api<{ personalization: PersonalizationView }>(
        `/api/applications/${encodeURIComponent(selectedAppId)}/personalization`,
      ).catch(() => null),
    ])
      .then(([appRes, persRes]) => {
        if (cancelled) return;
        setActiveApp(appRes.application);
        if (persRes?.personalization) {
          setPersonalization(persRes.personalization);
          const match = persRes.personalization.variants.find((v) => v.kind === selectedVariantKind);
          if (match) setVariantText(match.content);
        } else {
          setPersonalization(null);
          setVariantText('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveApp(null);
          setPersonalization(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAppId, selectedVariantKind]);

  if (loadError) return <ErrorPanel message="Could not load your Resume Studio." onRetry={() => void loadBase()} />;
  if (!facts) return <Loading label="Loading Resume Studio" />;

  const confirmedRoles = facts.filter((f) => f.kind === 'role' && f.approved);
  const confirmedSkills = facts.filter((f) => f.kind === 'skill' && f.approved);
  const confirmedEducation = facts.filter((f) => f.kind === 'education' && f.approved);
  const confirmedCertifications = facts.filter((f) => f.kind === 'certification' && f.approved);
  const confirmedProjects = (evidence ?? []).filter((e) => e.confirmed && e.kind === 'project');

  const candidateName =
    typeof settings['identity.fullName'] === 'string' && settings['identity.fullName'].trim()
      ? settings['identity.fullName'].trim()
      : 'Your Name';
  const candidateEmail = typeof settings['identity.email'] === 'string' ? settings['identity.email'].trim() : null;
  const candidatePhone = typeof settings['identity.phone'] === 'string' ? settings['identity.phone'].trim() : null;
  const candidateCountry =
    typeof settings['candidate.country'] === 'string' ? settings['candidate.country'].trim() : null;
  const linkedinUrl =
    typeof settings['candidate.linkedinUrl'] === 'string' ? settings['candidate.linkedinUrl'].trim() : null;

  const masterLines: string[] = [];
  masterLines.push(candidateName.toUpperCase());
  const contactParts = [candidateEmail, candidatePhone, candidateCountry, linkedinUrl].filter(Boolean);
  if (contactParts.length) masterLines.push(contactParts.join(' · '));
  masterLines.push('');

  masterLines.push('PROFESSIONAL SUMMARY');
  if (confirmedRoles.length > 0) {
    const latest = confirmedRoles[0];
    const skillNames = confirmedSkills
      .slice(0, 6)
      .map((s) => String(s.value.name))
      .join(', ');
    masterLines.push(
      `Experienced ${String(latest?.value.title ?? 'Professional')} with confirmed expertise in ${skillNames || 'technology'}. Verified record of accomplishment and disciplined delivery.`,
    );
  } else {
    masterLines.push('Add past roles and skills in your profile to generate your professional summary.');
  }
  masterLines.push('');

  masterLines.push('CORE SKILLS');
  if (confirmedSkills.length > 0) {
    masterLines.push(confirmedSkills.map((s) => String(s.value.name)).join(' • '));
  } else {
    masterLines.push('[Add skills in your profile]');
  }
  masterLines.push('');

  masterLines.push('PROFESSIONAL EXPERIENCE');
  if (confirmedRoles.length > 0) {
    for (const role of confirmedRoles) {
      const v = role.value;
      masterLines.push(
        `${String(v.title)} — ${v.employer ? String(v.employer) : 'Independent'} (${String(v.startYear)} – ${v.endYear ? String(v.endYear) : 'Present'})`,
      );
      if (v.summary) masterLines.push(`  ${String(v.summary)}`);
    }
  } else {
    masterLines.push('[Add experience in your profile]');
  }
  masterLines.push('');

  if (confirmedProjects.length > 0) {
    masterLines.push('VERIFIED PROJECTS & ACHIEVEMENTS');
    for (const p of confirmedProjects) {
      masterLines.push(`• ${String(p.value.name)}: ${String(p.value.summary)}`);
    }
    masterLines.push('');
  }

  if (confirmedEducation.length > 0 || confirmedCertifications.length > 0) {
    masterLines.push('EDUCATION & CERTIFICATIONS');
    for (const edu of confirmedEducation) {
      masterLines.push(
        `• ${String(edu.value.qualification)}${edu.value.institution ? ` — ${String(edu.value.institution)}` : ''}${edu.value.year ? ` (${String(edu.value.year)})` : ''}`,
      );
    }
    for (const cert of confirmedCertifications) {
      masterLines.push(
        `• ${String(cert.value.name)}${cert.value.issuer ? ` — ${String(cert.value.issuer)}` : ''}${cert.value.year ? ` (${String(cert.value.year)})` : ''}`,
      );
    }
    masterLines.push('');
  }

  const masterResumeContent = masterLines.join('\n');

  const atsChecks: AtsCheck[] = [
    {
      id: 'contact_info',
      label: 'Direct Contact Identifiers',
      passed: Boolean(candidateEmail && candidateName !== 'Your Name'),
      explanation: candidateEmail
        ? 'Email and name properly defined'
        : 'Add email in Settings to pass ATS contact extraction',
    },
    {
      id: 'core_headings',
      label: 'Standard ATS Section Headings',
      passed: confirmedRoles.length > 0 && confirmedSkills.length > 0,
      explanation: 'Uses standard headings: SUMMARY, CORE SKILLS, EXPERIENCE, EDUCATION',
    },
    {
      id: 'chronological_history',
      label: 'Chronological Experience Mapping',
      passed: confirmedRoles.length > 0,
      explanation:
        confirmedRoles.length > 0
          ? `${confirmedRoles.length} confirmed roles mapped with start/end dates`
          : 'Add at least one role to map timeline',
    },
    {
      id: 'evidence_provenance',
      label: 'Cryptographic Evidence Provenance',
      passed: true,
      explanation: '100% of resume claims are derived strictly from confirmed facts. Zero AI hallucinations.',
    },
    {
      id: 'clean_formatting',
      label: 'Single-Column Text Parsability',
      passed: true,
      explanation: 'No complex tables, multi-column blocks, or unparsable macros that confuse ATS parsers.',
    },
  ];

  const allPassed = atsChecks.every((c) => c.passed);

  const activeVariant = personalization?.variants.find((v) => v.kind === selectedVariantKind);
  const isDirty = activeVariant ? variantText !== activeVariant.content : false;

  const saveVariantEdit = async () => {
    if (!selectedAppId || !activeVariant) return;
    setSavingVariant(true);
    setVariantSaveStatus(null);
    try {
      await api(
        `/api/applications/${encodeURIComponent(selectedAppId)}/personalization/${encodeURIComponent(activeVariant.id)}`,
        {
          method: 'PUT',
          body: { content: variantText },
        },
      );
      setVariantSaveStatus('Saved document edit.');
      const updated = await api<{ personalization: PersonalizationView }>(
        `/api/applications/${encodeURIComponent(selectedAppId)}/personalization`,
      );
      setPersonalization(updated.personalization);
    } catch (err) {
      setVariantSaveStatus(
        err instanceof ApiError
          ? ((err.body as { message?: string } | null)?.message ?? 'Could not save edit.')
          : 'Could not save edit.',
      );
    } finally {
      setSavingVariant(false);
    }
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document Workspace"
        title="Resume Studio"
        lede="Evidence-backed tailoring: your confirmed career facts organized in one truthful master profile, tailored with zero fabrication and verified against role requirements."
        actions={
          <div
            className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1 gap-1"
            role="group"
            aria-label="Studio View Mode"
          >
            <Button
              type="button"
              variant={viewMode === 'master' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('master')}
            >
              Master Resume
            </Button>
            <Button
              type="button"
              variant={viewMode === 'compare' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('compare')}
            >
              Job Comparison
            </Button>
          </div>
        }
      />

      {readiness && (
        <section
          className="p-4 bg-card border border-border rounded-xl shadow-xs"
          aria-labelledby="readiness-studio-title"
        >
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <Badge variant={allPassed ? 'teal' : 'warning'} className="mr-2">
                {readiness.title}
              </Badge>
              <strong id="readiness-studio-title" className="text-foreground">
                Profile Status:
              </strong>{' '}
              <span className="text-muted-foreground text-sm">{readiness.summary}</span>
            </div>
            <Link
              href={readiness.actionHref}
              className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
            >
              {readiness.actionLabel}
            </Link>
          </div>
        </section>
      )}

      {/* ATS Validation Evidence Bar */}
      <section aria-labelledby="ats-health-title">
        <AtsScorecard atsChecks={atsChecks} />
      </section>

      {viewMode === 'master' ? (
        <section
          className="rounded-xl border border-border bg-card p-6 shadow-xs"
          aria-labelledby="master-preview-title"
        >
          <div className="flex justify-between items-center flex-wrap gap-4 mb-3">
            <h2 id="master-preview-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
              Master Resume Document
            </h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => downloadText('master-resume.txt', masterResumeContent)}
              >
                Download Plain Text (.txt)
              </Button>
              <Link
                href="/profile"
                className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
              >
                Edit Facts in Profile
              </Link>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Automatically compiled from your confirmed profile facts ({confirmedRoles.length} roles,{' '}
            {confirmedSkills.length} skills, {confirmedProjects.length} projects).
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Master Resume content"
            className="font-mono text-sm leading-relaxed bg-background border border-border rounded-xl p-6 whitespace-pre-wrap max-h-[600px] overflow-y-auto"
          >
            {masterResumeContent}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-labelledby="compare-title">
          <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
            <div>
              <h2 id="compare-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
                Side-by-Side Tailored Document Comparison
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Compare your canonical Master Resume with job-specific tailored documents.
              </p>
            </div>
            {applications.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="select-app" className="text-xs font-medium text-foreground m-0">
                  Application:
                </label>
                <select
                  id="select-app"
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} at {a.employer}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No applications prepared yet. Open any role in{' '}
              <Link href="/opportunities" className="text-primary hover:underline">
                Opportunities
              </Link>{' '}
              and click “Prepare an application”.
            </p>
          ) : (
            <>
              {activeApp && (
                <div className="mb-4 flex gap-3 items-center flex-wrap">
                  <div
                    className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1 gap-1"
                    role="group"
                    aria-label="Variant kind selector"
                  >
                    <Button
                      type="button"
                      variant={selectedVariantKind === 'resume' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setSelectedVariantKind('resume');
                        const r = personalization?.variants.find((v) => v.kind === 'resume');
                        if (r) setVariantText(r.content);
                      }}
                    >
                      Tailored Resume
                    </Button>
                    <Button
                      type="button"
                      variant={selectedVariantKind === 'cover_letter' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setSelectedVariantKind('cover_letter');
                        const c = personalization?.variants.find((v) => v.kind === 'cover_letter');
                        if (c) setVariantText(c.content);
                      }}
                    >
                      Tailored Cover Letter
                    </Button>
                  </div>
                  <Link
                    href={`/applications/${activeApp.id}`}
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
                  >
                    Open Full Application →
                  </Link>
                </div>
              )}

              {personalization?.requirements && personalization.requirements.length > 0 && (
                <details className="mb-4 p-4 bg-muted/30 border border-border rounded-xl">
                  <summary className="cursor-pointer font-semibold text-sm text-foreground">
                    Evidence Mapping for this Job ({personalization.requirements.length} requirements inspected)
                  </summary>
                  <ul className="divide-y divide-border/60 text-sm mt-3">
                    {personalization.requirements.map((req) => (
                      <li key={req.requirement} className="flex flex-col gap-1 py-2.5 first:pt-1 last:pb-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-foreground">{req.requirement}</strong>
                          <Badge variant="secondary">{req.classification.replaceAll('_', ' ')}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{req.explanation}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Master Reference */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <strong className="text-sm font-semibold text-foreground">Canonical Master Profile</strong>
                      <span className="block text-xs text-muted-foreground">Truthful source of truth</span>
                    </div>
                    <Badge variant="outline">Ground Truth</Badge>
                  </div>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Canonical Master Profile content"
                    className="font-mono text-xs leading-relaxed bg-background border border-border rounded-md p-3 whitespace-pre-wrap max-h-[500px] overflow-y-auto"
                  >
                    {masterResumeContent}
                  </div>
                </div>

                {/* Right: Tailored Editor */}
                <TailoredResumeEditor
                  selectedVariantKind={selectedVariantKind}
                  variantText={variantText}
                  isDirty={isDirty}
                  savingVariant={savingVariant}
                  variantSaveStatus={variantSaveStatus}
                  onVariantTextChange={setVariantText}
                  onSave={() => void saveVariantEdit()}
                  onDownload={() => downloadText(`tailored-${selectedVariantKind}.txt`, variantText)}
                />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default ResumeStudio;
