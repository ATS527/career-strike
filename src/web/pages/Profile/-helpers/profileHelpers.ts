import type { FactKind } from '../../../api';

export type FieldSpec = {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  required?: boolean;
  options?: [string, string][];
  hint?: string;
};

export const SECTIONS: {
  kind: FactKind;
  title: string;
  intro: string;
  fields: FieldSpec[];
  describe: (v: Record<string, unknown>) => string;
}[] = [
  {
    kind: 'skill',
    title: 'Skills',
    intro:
      'Demonstrated skills grounded in past projects and code. Names like “k8s” resolve canonically as “Kubernetes”.',
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
    intro:
      'Past and current employment history. Overlapping tenures are counted once for total experience calculation.',
    fields: [
      { name: 'title', label: 'Job title', type: 'text', required: true },
      { name: 'employer', label: 'Employer', type: 'text' },
      { name: 'startYear', label: 'Start year', type: 'number', required: true },
      { name: 'endYear', label: 'End year', type: 'number', hint: 'Leave empty if current' },
    ],
    describe: (v) =>
      `${String(v.title)}${v.employer ? ` at ${String(v.employer)}` : ''} · ${String(v.startYear)}–${v.endYear ?? 'now'}`,
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

export function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return 'SC';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function validLinkedin(s: string): boolean {
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
