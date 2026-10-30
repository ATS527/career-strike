import type { JsonSchema, SettingDefinition } from '../api';

// Maps a setting's JSON Schema to one of the control kinds the dashboard knows how to render,
// and converts between stored values and editable form drafts.

export type FieldKind =
  | { kind: 'choice'; values: string[] }
  | { kind: 'multi-choice'; values: string[] }
  | { kind: 'lines' }
  | { kind: 'optional-text'; pattern?: string }
  | { kind: 'optional-record'; properties: [string, JsonSchema][] };

/** Editable representation: text fields are strings, multi-choice is a list. */
export type Draft = string | string[] | Record<string, string>;

export function fieldKind(schema: JsonSchema): FieldKind | null {
  if (schema.type === 'string' && schema.enum) return { kind: 'choice', values: schema.enum };
  if (schema.type === 'array' && schema.items?.enum) return { kind: 'multi-choice', values: schema.items.enum };
  if (schema.type === 'array' && schema.items?.type === 'string') return { kind: 'lines' };
  const nonNull = schema.anyOf?.find((s) => s.type !== 'null');
  if (nonNull && schema.anyOf?.some((s) => s.type === 'null')) {
    if (nonNull.type === 'string') return { kind: 'optional-text', pattern: nonNull.pattern };
    if (nonNull.type === 'object' && nonNull.properties) return { kind: 'optional-record', properties: Object.entries(nonNull.properties) };
  }
  return null;
}

export function toDraft(kind: FieldKind, value: unknown): Draft {
  switch (kind.kind) {
    case 'choice':
      return typeof value === 'string' ? value : '';
    case 'multi-choice':
      return Array.isArray(value) ? value.map(String) : [];
    case 'lines':
      return Array.isArray(value) ? value.join('\n') : '';
    case 'optional-text':
      return typeof value === 'string' ? value : '';
    case 'optional-record': {
      const record = (value ?? {}) as Record<string, unknown>;
      return Object.fromEntries(kind.properties.map(([name]) => [name, record[name] == null ? '' : String(record[name])]));
    }
  }
}

export function fromDraft(kind: FieldKind, draft: Draft): unknown {
  switch (kind.kind) {
    case 'choice':
      return draft;
    case 'multi-choice':
      return draft;
    case 'lines':
      return String(draft)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    case 'optional-text': {
      const text = String(draft).trim();
      return text === '' ? null : text;
    }
    case 'optional-record': {
      const record = draft as Record<string, string>;
      if (Object.values(record).every((v) => v.trim() === '')) return null;
      return Object.fromEntries(
        kind.properties.map(([name, schema]) => {
          const raw = (record[name] ?? '').trim();
          return [name, schema.type === 'integer' || schema.type === 'number' ? (raw === '' ? null : Number(raw)) : raw];
        }),
      );
    }
  }
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function groupOf(def: SettingDefinition): 'search' | 'candidate' {
  return def.key.startsWith('candidate.') ? 'candidate' : 'search';
}
