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
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div>
          <strong className="text-sm font-semibold text-foreground">
            Tailored {selectedVariantKind === 'resume' ? 'Résumé' : 'Cover Letter'}
          </strong>
          <span className="text-xs text-muted-foreground block">Highlighted achievements &amp; matching keywords</span>
        </div>
        <div className="flex gap-2 items-center">
          <Button type="button" size="sm" onClick={onDownload} disabled={!variantText}>
            Download .txt
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={savingVariant || !isDirty}>
            {savingVariant ? 'Saving...' : 'Save edits'}
          </Button>
        </div>
      </div>
      {variantSaveStatus && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mb-2">
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
