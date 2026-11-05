import { currentCsrfToken } from '../api';

/** Upload a document as raw bytes. Returns a message for the candidate. */
export async function uploadDocument(file: File, kind: 'resume' | 'cover_letter' | 'other'): Promise<string> {
  try {
    const csrf = currentCsrfToken();
    const res = await fetch('/api/documents', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-cs-filename': encodeURIComponent(file.name),
        'x-cs-document-kind': kind,
        'x-cs-csrf': csrf,
      },
      body: file,
    });
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return res.ok ? `Uploaded ${file.name}.` : (body?.message ?? 'Upload failed.');
  } catch {
    return 'Upload failed. Check that the service is running.';
  }
}
