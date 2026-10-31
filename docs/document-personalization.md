# Tailored résumé and cover-letter drafts

Career Strike can prepare a local, job-specific source-text résumé and cover letter for an
application you have already prepared. It is an evidence-first drafting aid, not an automatic
application or a substitute for checking your own work.

## Use it safely

1. In **Profile**, add only skills, roles, projects, achievements and links you can verify.
2. Open a prepared application and choose **Prepare tailored documents**.
3. Read the job requirements and the shown evidence map. `MISSING` and `UNVERIFIED` mean Career
   Strike did not find confirmed evidence; they are not invitations to add a claim.
4. Review and edit the source text. An edit creates a new immutable variant and requires a new
   application review.
5. Complete employer-specific questions, review the exact package, approve it, and submit it
   yourself on the employer's official site.

The master profile and original uploaded résumé are never overwritten. Every generated variant is
bound to one Career Strike application, a snapshot of that job description, and a fingerprint of
the confirmed profile facts used to create it. If the profile or job description changes, the
package is marked stale and cannot be approved until regenerated.

## What it currently does

- Generates deterministic, editable source text locally.
- Retains the evidence references supporting matched job skills.
- Keeps the generated cover letter out of a submission when the employer did not ask for one.
- Keeps variant content out of MCP tools and connected assistants.

## Deliberate limits

This release does **not** parse PDF/DOCX résumé contents, generate PDF/DOCX files, translate
documents, or send résumé data to a remote AI provider. Uploads remain private originals in the
local document vault. You can paste confirmed information into your profile instead.

Career Strike does not invent skills, credentials, project ownership, achievements, dates,
metrics, work authorization or motivation. Candidate edits are allowed, but must be reviewed by
the candidate; an edited claim does not receive automatic evidence provenance.

Job descriptions are untrusted content. Text inside a posting is treated only as job data, never
as an instruction for Career Strike or a connected assistant.
