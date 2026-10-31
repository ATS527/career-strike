# Career Strike

Career Strike is a local-first job-search workspace. It helps a job hunter collect roles from
selected job boards, compare them against their own profile, track every application, and prepare
for interviews—without putting their career data in a third-party cloud.

It works completely on its own. Codex, Claude Code, and OpenCode can be connected later as
optional MCP clients; they are helpers, not a requirement.

New to Career Strike? Follow the [practical job-hunt guide](docs/job-hunt-guide.md) for a
step-by-step first search, country preferences, trusted job discovery, applications and follow-up.

## What it does

- **Finds roles you choose to monitor.** Add a public Greenhouse, Lever, or Ashby careers page,
  then fetch it now or check it automatically while Career Strike is running.
- **Helps you decide where to focus.** Search, filter, shortlist, exclude, and compare roles.
  Career Strike can evaluate fit against the profile facts you add.
- **Keeps an honest application pipeline.** Track drafts, applications ready for review,
  applications you have approved, submissions you confirm, follow-ups, interviews, and offers.
- **Keeps you in charge.** You review the exact application package and approve it before any
  action. Real applications are submitted by you on the employer's site; Career Strike never
  sends an application or messages a recruiter for you.
- **Keeps your search private.** The dashboard and database run on your computer only. There is
  no account, cloud sync, telemetry, or analytics.

## How it works

```text
Your profile + target roles       Public job boards             Optional AI assistant
             |                         |                              |
             +----------> Career Strike local service <---------------+
                                     |
                        Private dashboard on your computer
                                     |
          shortlist -> prepare -> review -> approve -> you submit
```

Career Strike listens only on `127.0.0.1`, so the dashboard is available only from your computer.
Job-board requests go only to the public APIs for Greenhouse, Lever, and Ashby. Your profile,
documents, contact details, application records, and notes do not go to those services.

## Start here: a job hunter's first session

### 1. Install Career Strike

Requirements: Node.js 22.12 or later, macOS or Linux, and a modern browser. Windows is not yet
tested.

Career Strike is installed from a package built from this repository:

```bash
npm install
npm pack
npm install --global ./career-strike-0.1.0.tgz
```

The package filename includes its version; if it differs, use the `.tgz` filename printed by
`npm pack`.

### 2. Create your private workspace and open it

```bash
career-strike init
career-strike dashboard
```

The second command starts the local service when needed and opens a signed-in dashboard. Its link
is single-use, which protects the dashboard if someone else sees your browser history. If you
prefer to copy the link yourself, run `career-strike dashboard --no-open`.

### 3. Add only the facts you want used for matching

Open **Profile** and add your skills, past roles, education, certifications, languages, and any
documents you want to keep in the workspace. These facts stay on your computer. Career Strike
uses them to explain a role's fit; it does not invent qualifications or silently use a suggested
fact until you approve it.

### 4. Tell it what a good role looks like

From the dashboard, add your target roles, working preferences, availability, and job-board
sources. Then visit **Opportunities → Job boards** and add the Greenhouse, Lever, or Ashby
careers pages for employers you actually want to follow.

Choose **Fetch now** to collect current public postings. You can enable background monitoring in
**Settings → Background monitoring**; it runs only while the local service is running.

### 5. Review and shortlist roles

In **Opportunities**, filter by role type, location arrangement, source, fit, and status. Open a
posting to see the requirements and fit explanation, then mark it **Shortlisted** or **Not for
me**. Select two to four roles to compare them side by side.

### 6. Prepare an application, then submit it yourself

Open a shortlisted job and choose **Prepare an application**. Fill in anything missing and review
the package in **Applications**. Approval signs that exact version; changing it cancels the
approval. When it is ready, open the employer's site, submit it yourself, then confirm the result
in Career Strike so your pipeline stays accurate.

### 7. Keep momentum

Use **Home** for the next best actions, **Applications** for follow-ups and status changes, and
**Insights** for suggestions you may accept or ignore. Add interview stages and preparation notes
as the search progresses.

## Optional: connect an AI assistant

The built-in dashboard is the source of truth. An AI assistant is optional and connects locally
over MCP:

```bash
career-strike connect codex
# or: career-strike connect claude-code
# or: career-strike connect opencode
```

On connection, an assistant can search and read public postings, add public job boards or jobs,
and shortlist or exclude jobs. It cannot access your profile, documents, contact details,
applications, settings, or approvals by default.

You can grant additional access in **Settings → AI assistants**. If an assistant requests
profile facts, Career Strike shows the exact values and stated purpose before issuing a one-time,
time-limited disclosure. An assistant can never approve or submit an application, edit one,
contact an employer, or grant itself more access.

Disconnect an assistant at any time:

```bash
career-strike disconnect codex
```

For Codex, this repository also includes a portable plugin package at
[`plugins/career-strike`](plugins/career-strike). It bundles the same local MCP server and
safe job-search workflow. Choose either the direct `career-strike connect codex` route above or
the plugin route—do not configure both, as that would show duplicate Career Strike tools.
After installing Career Strike from an npm package, run `career-strike plugin-path` to locate the
bundled plugin directory.

Other MCP-compatible clients can use the same server without a product-specific integration:

```bash
career-strike authorize-mcp axym
# Configure that client to launch: career-strike mcp --client axym
```

`axym` is only a local client label; Career Strike does not claim Axym compatibility until that
client has been configured and tested. Revoke its credential at any time with
`career-strike revoke-mcp axym`, then remove its MCP entry in that client.

## Useful commands

| Command | Use it for |
| --- | --- |
| `career-strike dashboard` | Start the local service if necessary and open a signed-in dashboard. |
| `career-strike doctor` | Check the installation and local data permissions without changing anything. |
| `career-strike start` / `career-strike stop` | Run or stop the service in the background. |
| `career-strike status` | Check whether the service is running. |
| `career-strike practice` | Try the review, approval, and automated-submission flow against a safe practice site on your own computer. |
| `career-strike export <folder>` | Create a readable copy of all career records and documents. |
| `career-strike backup <folder>` / `restore <folder>` | Back up and recover the local workspace. |
| `career-strike delete-data --confirm "delete my career data"` | Permanently remove Career Strike data from this computer. |

## Your data and privacy

Career data is kept outside this repository in the per-user application-data directory:

- macOS: `~/Library/Application Support/career-strike`
- Linux: `$XDG_DATA_HOME/career-strike` (normally `~/.local/share/career-strike`)
- Custom location: set `CAREER_STRIKE_HOME`

The directory is owner-only, and Career Strike refuses to write career data inside a Git working
tree. Export regularly if you want an independent copy. Read the full [privacy and security
model](docs/privacy.md) for the precise network, assistant-access, approval, logging, and deletion
rules.

## Documentation

- [Installing, updating, backup, export, and troubleshooting](docs/install.md)
- [Practical job-hunt guide](docs/job-hunt-guide.md)
- [Privacy and security model](docs/privacy.md)
- [Known limitations](docs/limitations.md)

## Development

```bash
npm install
npm run check
npm run acceptance
```

`npm run check` runs type checks and tests. The pre-commit hook scans staged content for secrets
and accidental personal data before running the checks.

## License

Apache-2.0. See [LICENSE](LICENSE).
