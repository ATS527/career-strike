# Privacy and security model

Career Strike holds the most private parts of a job search: your work history, salary
expectation, documents, and every application you make. This page states what it does with them.
Each statement is backed by tests whose latest results are recorded in `acceptance/registry.json`.

## Everything stays on your computer

- Your data lives in a per-user directory readable only by you (0700; files 0600), never inside
  a git working tree. See [install.md](install.md#where-your-data-lives).
- The service listens on `127.0.0.1` only. It is never reachable from another computer.
- There is no account, no cloud sync, no telemetry and no analytics.

## What leaves your computer

Only these requests, and only when you add or fetch a job board or prepare an application:

| Destination                | What is sent                            | Why                                                            |
| -------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `boards-api.greenhouse.io` | A GET for a public board or one posting | Read job postings and an employer's application form questions |
| `api.lever.co`             | A GET for a public board                | Read job postings                                              |
| `api.ashbyhq.com`          | A GET for a public board                | Read job postings                                              |

These requests carry no information about you: no profile data, no cookies, no identifiers beyond
a plain `User-Agent`. Only these three hosts can be contacted (an allowlist, so a pasted link
cannot make Career Strike fetch anything else), redirects are refused, responses are limited to
20 MB, and each host is contacted at most once per second. If a source asks Career Strike to slow
down, scheduled checks wait at least as long as asked.

### Updates

Career Strike contacts GitHub about updates only when you ask (`career-strike update`, or
_Check now_ in Settings) or after you turn on weekly checks, which are off by default:

| Destination                                                             | What is sent                                                        | Why                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| `api.github.com`                                                        | A GET for Career Strike's public release list                       | Find out whether a newer version exists |
| `github.com`                                                            | A GET for a release package and its checksum (only when you update) | Download the update                     |
| `objects.githubusercontent.com`, `release-assets.githubusercontent.com` | The same download, where GitHub redirects it                        | Download the update                     |

These requests also carry nothing about you; the `User-Agent` names the Career Strike version.
Only these hosts can be contacted for updates, over HTTPS, and redirects are followed only between
them. A package is installed only if it matches its published SHA-256 checksum.

Career Strike never submits an application to a real employer and never sends a message to a
recruiter. You do that yourself on the employer's site, using the package you reviewed and
approved. Automated submission exists only for the owned practice endpoint on your own computer
(`career-strike practice`), which is used to test the process safely.

## The dashboard

- You sign in with a single-use link from `career-strike dashboard`, valid for one minute. It
  becomes a session cookie (`HttpOnly`, `SameSite=Strict`) that lasts up to seven days or until
  you sign out.
- Requests from other websites are refused: the `Host` header must be the local address (blocks
  DNS rebinding), the `Origin` must be the dashboard itself, cross-site fetches are rejected, and
  every change needs a separate anti-forgery token.
- The dashboard sends a strict Content Security Policy and cannot be framed. Text from job
  postings is shown as plain text: scripts, styles and links inside postings are not run.

## Classes of data

Every column in the database has a class, checked by a test whenever the schema changes
(`src/store/classification.ts`):

| Class     | Examples                                                          | Treatment                                                                                                                                  |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PUBLIC    | Job postings, board names                                         | May be shown to connected AI assistants.                                                                                                   |
| INTERNAL  | Task states, timestamps                                           | Operational; never contains anything about you.                                                                                            |
| PERSONAL  | Shortlist, application states, notes                              | Shown to an assistant only if you allow it.                                                                                                |
| SENSITIVE | Profile, salary, contact details, documents, application packages | Shared with an assistant only through a single-use disclosure you approve. Contact details and documents are never shared with assistants. |
| SECRET    | Credential hashes, approval signatures                            | Never exported, logged or shown.                                                                                                           |

Anything computed from other data is at least as protected as the most protected thing it was
computed from.

## AI assistants

AI assistants (Codex, Claude Code, OpenCode) are optional. Connected over MCP, an assistant gets
its own token, stored in an owner-only file, and can:

- always: search and read public postings, add jobs and job boards, shortlist or exclude jobs;
- if you allow it in **Settings → AI assistants**: see your shortlist, boards and application
  states, or see how jobs fit your profile;
- if you approve a specific request: receive specific profile details once (see below).

An assistant can never approve, submit or edit an application, read your documents or contact
details, change settings, or grant itself access. Everything an assistant receives is built by an
explicit allowlist of fields, so new internal data cannot leak to it by accident. Text written by
employers is marked as untrusted when given to an assistant, and instructions hidden in postings
are not acted on.

### Single-use disclosure

When an assistant needs profile details (for example, your skills to help with a cover letter) it
asks with a stated purpose and a list of categories. You see the request in **Settings → AI
assistants**, review the exact values that would be shared, can untick any of them, and approve or
decline. An approval can be collected once, within an hour; then the shared copy is deleted.
Career Strike keeps a record of who asked, why, what you shared, and a fingerprint of it. If your
data changes after you looked at the preview, the approval is refused and you are asked to look
again.

## Applications and approvals

- An application package is shown to you exactly as it would be sent. Approving it signs that
  exact content; any edit afterwards cancels the approval.
- Approvals are given only in the dashboard, are single-use, and expire after seven days. The
  signing key is kept in the macOS keychain (or an owner-only file on other systems).
- A role you have already applied to is flagged as a duplicate and is not submitted again.
- An application counts as submitted only when you confirm it, or, for the practice endpoint,
  when a receipt is verified. An uncertain result is shown as uncertain.

## Logs

Logs are kept in the data directory. Tokens, cookies, passwords and keys are removed before
writing; email addresses and phone numbers are masked; free-text fields such as notes, résumé
text, cover letters and descriptions are recorded only as their length. The audit trail records
what changed and who changed it (for example "setting updated: country"), not your values; for a
disclosure it also records the assistant's stated purpose and which categories you shared.

## Your control

- `career-strike export` writes every record and document to a folder you choose.
- `career-strike delete-data` removes all of it, including signing keys, and checks that nothing
  remains.
- Profile facts suggested from a résumé are used only after you approve each one.
- Strategy suggestions on the **Insights** page change nothing unless you accept them, and can only
  adjust monitoring, add a preferred role, or note a skill to learn.

## For contributors

Real candidate data must never appear in the repository, tests, fixtures, screenshots or commit
messages; use synthetic examples (`example.com` addresses, invented names). The pre-commit hook
scans staged changes for secrets, non-example email addresses and any personal terms you list in
`<data dir>/privacy-denylist.txt`.
