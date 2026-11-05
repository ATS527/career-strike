# Installing and running Career Strike

Career Strike runs entirely on your computer: a local service, a browser dashboard, a command-line
tool, and an optional MCP server for AI assistants. No account or AI assistant is needed.

For a guided first search after installation, use the [practical job-hunt guide](job-hunt-guide.md).

## Requirements

- Node.js 22.12 or newer (tested on Node 24).
- macOS or Linux. Windows is not tested.
- A modern browser (tested with Chromium).

## Install

Install the newest release with one command. The latest release on this repository's GitHub
**Releases** page shows it ready to copy; it has this form, where `<owner>` is the GitHub account
that publishes Career Strike:

    npm install --global https://github.com/<owner>/career-strike/releases/latest/download/career-strike.tgz

Each release also has a versioned package (`career-strike-<version>.tgz`), its SHA-256 checksum,
and a build-provenance attestation proving it was built from this repository by its release
workflow. To check a download yourself:
`gh attestation verify career-strike-<version>.tgz --repo <owner>/career-strike`.

To build from source instead:

    npm install
    npm pack                                 # builds and writes career-strike-<version>.tgz
    npm install --global ./career-strike-<version>.tgz

Check the installation (after `career-strike init`, below):

    career-strike doctor

Every line should read `PASS`. `doctor` only reads; it never changes anything.

## First run

    career-strike init         # create the private data directory and database
    career-strike dashboard    # start the service if needed and open the dashboard

The dashboard opens with a single-use sign-in link. If you open `http://127.0.0.1:47615/` without
it, the page explains how to get a new link; run `career-strike dashboard` again.

Home lists what to set up first (your skills, target roles, where you can work, when you can
start, and a job board to monitor). Each item links to the page where you do it.

## Commands

| Command                                                       | What it does                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `career-strike init`                                          | Create the data directory and database.                                                                                                                 |
| `career-strike dashboard`                                     | Start the service if needed and open the dashboard (`--no-open` prints the link).                                                                       |
| `career-strike start` / `stop`                                | Run the service in the background, or stop it.                                                                                                          |
| `career-strike serve`                                         | Run the service in the foreground (Ctrl-C to stop).                                                                                                     |
| `career-strike status`                                        | Say whether the service is running (`--json` for scripts).                                                                                              |
| `career-strike doctor`                                        | Check the installation without changing anything.                                                                                                       |
| `career-strike verify-market IN`                              | Perform one permitted live fetch of a curated employer-direct board; it adopts and monitors the board only if it contains an explicitly Indian posting. |
| `career-strike connect <assistant>`                           | Connect Codex, Claude Code or OpenCode over MCP.                                                                                                        |
| `career-strike disconnect <assistant>`                        | Remove Career Strike from that assistant and revoke its access.                                                                                         |
| `career-strike authorize-mcp <client>`                        | Create a local MCP credential without editing a client’s configuration.                                                                                 |
| `career-strike revoke-mcp <client>`                           | Revoke a generic MCP credential and remove its local token.                                                                                             |
| `career-strike plugin-path`                                   | Print the bundled Codex plugin directory.                                                                                                               |
| `career-strike practice`                                      | Run a practice application endpoint on this computer to try automated submission safely.                                                                |
| `career-strike export <folder>`                               | Write all your data and documents to a new folder, readable without Career Strike.                                                                      |
| `career-strike backup <folder>`                               | Copy the database and documents for `restore`.                                                                                                          |
| `career-strike restore <folder>`                              | Replace current data with a verified backup (current data is kept aside first).                                                                         |
| `career-strike update`                                        | Install the newest release; your data is backed up first and the update can be undone. See [Updating](#updating).                                       |
| `career-strike rollback`                                      | Restore the database backup saved before an upgrade (current data is kept aside first).                                                                 |
| `career-strike delete-data --confirm "delete my career data"` | Permanently delete all Career Strike data on this computer.                                                                                             |
| `career-strike uninstall`                                     | Remove Career Strike from AI assistants and remove the program. Your data is kept.                                                                      |

### Developing the dashboard

From the repository, run both the service and Vite with one command:

```bash
npm run dev
```

This starts the local service and Vite with hot reload, then opens a one-time sign-in link in
your browser. Vite serves the UI at `http://127.0.0.1:5173` and proxies API and sign-in requests
to the service. Press Ctrl+C to stop development; if the service was already running, it is left
running. To open the normal built dashboard instead, use `career-strike dashboard`.

## Updating

    career-strike update

That is all. It shows what is new and asks before changing anything, then:

1. downloads the release and checks it against its published SHA-256 checksum (and its build
   provenance too, if the [GitHub CLI](https://cli.github.com) is installed and signed in);
2. keeps a copy of the version you have, stops the service and backs up your data;
3. installs the new version and checks that it reports the right version and starts cleanly
   (starting applies any database changes, after their own backup);
4. restarts the service on the same port if it was running.

If any step fails, the previous version and your data are put back automatically and nothing is
lost. When you next open the dashboard, it shows what changed.

| Command                           | What it does                                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `career-strike update --check`    | Only say whether a newer version has been released.                                                                                                                                                                        |
| `career-strike update --undo`     | Go back to the version the last update replaced. If the new version changed how data is stored, your data is restored from the backup taken just before the update; anything you changed since is kept aside, not deleted. |
| `career-strike update --to 0.3.0` | Install a specific newer release.                                                                                                                                                                                          |
| `career-strike update --yes`      | Do not ask for confirmation (for scripts).                                                                                                                                                                                 |

**Being told about new versions.** Career Strike never contacts anyone about updates unless you
ask. To be told when a new version is out, turn on _Check for new versions_ in Settings →
Background monitoring (`career-strike init` also asks once). It then asks GitHub's public release
list once a week and shows a note in the dashboard. Settings → Updates shows your version and has
a _Check now_ button.

**Updating from 0.1.0 (once).** Version 0.1.0 has no `update` command, so install 0.2.0 by hand.
Your data is kept:

    career-strike stop
    npm install --global https://github.com/<owner>/career-strike/releases/latest/download/career-strike.tgz
    career-strike start

From then on, use `career-strike update`.

**Running from a source checkout?** `update` only manages installs made with
`npm install --global`. In a checkout, run `git pull && npm ci && npm run build`, then restart the
service. `career-strike status` warns when the running service is older than the installed
program.

## Where your data lives

- macOS: `~/Library/Application Support/career-strike`
- Linux: `$XDG_DATA_HOME/career-strike` (usually `~/.local/share/career-strike`)
- Anywhere else you choose: set `CAREER_STRIKE_HOME`.

The directory is readable only by you (0700, files 0600). Career Strike refuses to store data,
exports or backups inside a git working tree, so career data cannot be committed by accident.

## Connecting an AI assistant (optional)

    career-strike connect claude-code     # or: codex, opencode

This adds a `career-strike` entry to that assistant's MCP settings using the assistant's own
command-line tool. The assistant can then search public postings, add jobs and boards, and
shortlist. It cannot see anything about you until you allow it in **Settings → AI assistants**,
and it can never approve or submit an application. To remove it:

    career-strike disconnect claude-code

### Codex plugin route

The repository ships a portable Codex plugin under
[`plugins/career-strike`](../plugins/career-strike). The package includes the same Career Strike
stdio MCP server and a skill describing its privacy and approval rules. Install the plugin through
your chosen Codex plugin distribution flow, then authorize its local client once:

    career-strike authorize-mcp codex

The plugin starts `career-strike mcp --client codex`. Do **not** also run
`career-strike connect codex`; choose the plugin route or the direct CLI route so the agent does
not receive duplicate tools.

When Career Strike was installed from its npm package, locate this bundled plugin with:

    career-strike plugin-path

### Any compatible MCP client

For a client not built into the `connect` command—such as an Axym deployment that supports local
stdio MCP—choose a lowercase label and authorize it explicitly:

    career-strike authorize-mcp axym

Configure that client with the following local command. The token remains in Career Strike's
owner-only data directory; do not put it in the client configuration or an environment variable.

```json
{
  "mcpServers": {
    "career-strike": {
      "command": "career-strike",
      "args": ["mcp", "--client", "axym"]
    }
  }
}
```

This is a generic MCP recipe, not a statement that every product supports MCP or this exact
configuration format. Test the connected client against `cs_status` before relying on it. To
withdraw access, run `career-strike revoke-mcp axym` and remove the client-side MCP entry.

## Trying automated submission safely

Applications to real employers are always submitted by you, on the employer's site. To see how
automated submission works, run an owned practice endpoint on this computer:

    career-strike practice

It adds a practice job; prepare, approve and submit it from the dashboard. Nothing leaves your
computer.

## Monitoring job boards

Add a Greenhouse, Lever or Ashby careers page under **Opportunities → Job boards**. Boards are
fetched when you add them and when you press **Fetch now**. To check them automatically, choose an
interval under **Settings → Background monitoring** (“Check job boards automatically”).
Automatic checks run only while the service is running.

### Verifying a configured market

Configured countries are not automatically discovery-available. To certify a curated India
employer-direct path, with the service stopped, run:

    career-strike verify-market IN --target sarvam-india

The command uses the existing allowlisted ATS adapter. It saves neither a board nor any jobs if
the source cannot be reached, its response is invalid, or no result has explicit India location
evidence. A successful response is saved as a monitored board and is the only condition under
which that local installation may describe India as discovery-available.

## Upgrading

Install the new package the same way. On first start, the database is upgraded in place; a copy
of the previous database is saved in `backups/` inside the data directory first. A database from
a newer version is never downgraded. To restore the pre-upgrade copy, stop the service and run
`career-strike rollback`.

## Backup, export and deletion

- `backup` is for putting things back with `restore`. Approval signing keys (in the macOS
  keychain, or in the data directory elsewhere) are not included, so approvals given before
  restoring on another computer must be given again.
- `export` is for you to keep or inspect: one JSON file with every record and a folder with your
  documents. Login sessions, credential hashes and approval signatures are left out.
- `delete-data` removes the database, documents, logs, backups, assistant tokens and signing keys,
  then checks that none of them remain. Files you put in the data directory yourself are left
  alone and listed. Stop the service first (`career-strike stop`).

## Uninstalling

    career-strike uninstall

This stops the service, removes the `career-strike` entry from every installed assistant that has
one (other entries are untouched), and removes the program if it was installed with
`npm install --global`. It then asks whether to delete your locally stored Career Strike data:

    Do you also want to delete your locally stored Career Strike data?
    Your resumes, career profile, saved jobs and application history may be permanently deleted.
    Delete local data? [y/N]

The default is No: your data is kept. Press Enter to keep it. If you choose Yes, Career Strike
shows the exact Career Strike-managed files and folders it would delete, offers a backup first,
and requires a final explicit confirmation before deleting anything.

Non-interactive uninstalls keep your data by default. To delete it without a prompt, run
`career-strike uninstall --delete-data --confirm "delete my career data"`. A generic
`--yes` for uninstalling the program is never treated as consent to delete personal data.

## Troubleshooting

- **The dashboard says the service is not running.** Run `career-strike dashboard`; it starts the
  service and opens a new link. The page also recovers by itself once the service is back.
- **`doctor` reports `data-permissions`.** Run `chmod 700` on the data directory.
- **Port 47615 is in use.** Use `career-strike dashboard --port <port>`.
- **`restore` or `delete-data` says the service is running.** Run `career-strike stop` first.
