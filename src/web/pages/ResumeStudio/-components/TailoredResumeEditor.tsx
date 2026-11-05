import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';

export function TailoredResumeEditor({
  selectedVariantKind,
  variantText,
  isDirty,
  savingVariant,
  variantSaveStatus,
  onVariantTextChange,
  onSave,
  onDownload,
}: {
  selectedVariantKind: 'resume' | 'cover_letter';
  variantText: string;
  isDirty: boolean;
  savingVariant: boolean;
  variantSaveStatus: string | null;
  onVariantTextChange: (text: string) => void;
  onSave: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--paper-raised)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
        padding: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <strong style={{ fontSize: '0.95rem' }}>
            Tailored {selectedVariantKind === 'resume' ? 'Résumé' : 'Cover Letter'}
          </strong>
          <span className="muted" style={{ fontSize: '0.8rem', display: 'block' }}>
            Highlighted achievements &amp; matching keywords
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <Button type="button" size="sm" onClick={onDownload} disabled={!variantText}>
            Download .txt
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={savingVariant || !isDirty}>
            {savingVariant ? 'Saving...' : 'Save edits'}
          </Button>
        </div>
      </div>
      {variantSaveStatus && (
        <p role="status" aria-live="polite" className="save-status mb-2 text-xs">
          {variantSaveStatus}
        </p>
      )}
      <Textarea
        id="tailored-content-editor"
        rows={22}
        className="font-mono text-xs leading-relaxed bg-background"
        value={variantText}
        onChange={(e) => onVariantTextChange(e.target.value)}
        placeholder="Select an application to view its tailored document variant..."
      />
    </div>
  );
}
