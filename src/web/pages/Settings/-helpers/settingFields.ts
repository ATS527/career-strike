import type { JsonSchema, SettingDefinition } from '../../../api';

// Maps a setting's JSON Schema to one of the control kinds the dashboard knows how to render,
// and converts between stored values and editable form drafts.

export type FieldKind =
  | { kind: 'choice'; values: string[] }
  | { kind: 'multi-choice'; values: string[] }
  | { kind: 'lines' }
  | { kind: 'country-authorizations'; values: string[] }
  | { kind: 'optional-text'; pattern?: string }
  | { kind: 'optional-record'; properties: [string, JsonSchema][] };

/** Editable representation: text fields are strings, multi-choice is a list. */
export type Draft = string | string[] | Record<string, string>;

export function fieldKind(schema: JsonSchema): FieldKind | null {
  if (schema.type === 'string' && schema.enum) return { kind: 'choice', values: schema.enum };
  if (schema.type === 'array' && schema.items?.enum) return { kind: 'multi-choice', values: schema.items.enum };
  if (schema.type === 'array' && schema.items?.type === 'string') return { kind: 'lines' };
  if (schema.type === 'object' && typeof schema.additionalProperties === 'object' && schema.additionalProperties.enum) {
    return { kind: 'country-authorizations', values: schema.additionalProperties.enum };
  }
  const nonNull = schema.anyOf?.find((s) => s.type !== 'null');
  if (nonNull && schema.anyOf?.some((s) => s.type === 'null')) {
    if (nonNull.type === 'string') return { kind: 'optional-text', pattern: nonNull.pattern };
    if (nonNull.type === 'object' && nonNull.properties)
      return { kind: 'optional-record', properties: Object.entries(nonNull.properties) };
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
    case 'country-authorizations':
      return value && typeof value === 'object'
        ? Object.entries(value as Record<string, unknown>)
            .map(([country, status]) => `${country}=${String(status)}`)
            .join('\n')
        : '';
    case 'optional-text':
      return typeof value === 'string' ? value : '';
    case 'optional-record': {
      const record = (value ?? {}) as Record<string, unknown>;
      return Object.fromEntries(
        kind.properties.map(([name]) => [name, record[name] == null ? '' : String(record[name])]),
      );
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
    case 'country-authorizations':
      return Object.fromEntries(
        String(draft)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [country, ...status] = line.split('=');
            return [country?.trim().toUpperCase() ?? '', status.join('=').trim()];
          }),
      );
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
          return [
            name,
            schema.type === 'integer' || schema.type === 'number' ? (raw === '' ? null : Number(raw)) : raw,
          ];
        }),
      );
    }
  }
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function groupOf(def: SettingDefinition): 'search' | 'candidate' | 'identity' | 'monitoring' {
  if (def.key.startsWith('identity.')) return 'identity';
  if (def.key.startsWith('monitoring.')) return 'monitoring';
  return def.key.startsWith('candidate.') ? 'candidate' : 'search';
}
