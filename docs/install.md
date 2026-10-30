# Installing and running Career Strike

Career Strike runs entirely on your computer: a local service, a browser dashboard, a command-line
tool, and an optional MCP server for AI assistants. No account or AI assistant is needed.

## Requirements

- Node.js 22.12 or newer (tested on Node 24).
- macOS or Linux. Windows is not tested.
- A modern browser (tested with Chromium).

## Install

Career Strike is not published to the npm registry. Build a package from this repository and
install it:

    npm install
    npm pack                                 # builds and writes career-strike-<version>.tgz
    npm install --global ./career-strike-0.1.0.tgz

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

| Command | What it does |
| --- | --- |
| `career-strike init` | Create the data directory and database. |
| `career-strike dashboard` | Start the service if needed and open the dashboard (`--no-open` prints the link). |
| `career-strike start` / `stop` | Run the service in the background, or stop it. |
| `career-strike serve` | Run the service in the foreground (Ctrl-C to stop). |
| `career-strike status` | Say whether the service is running (`--json` for scripts). |
| `career-strike doctor` | Check the installation without changing anything. |
| `career-strike connect <assistant>` | Connect Codex, Claude Code or OpenCode over MCP. |
| `career-strike disconnect <assistant>` | Remove Career Strike from that assistant and revoke its access. |
| `career-strike practice` | Run a practice application endpoint on this computer to try automated submission safely. |
| `career-strike export <folder>` | Write all your data and documents to a new folder, readable without Career Strike. |
| `career-strike backup <folder>` | Copy the database and documents for `restore`. |
| `career-strike restore <folder>` | Replace current data with a verified backup (current data is kept aside first). |
| `career-strike delete-data --confirm "delete my career data"` | Permanently delete all Career Strike data on this computer. |
| `career-strike uninstall` | Remove Career Strike from AI assistants and remove the program. Your data is kept. |

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

## Upgrading

Install the new package the same way. On first start, the database is upgraded in place; a copy
of the previous database is saved in `backups/` inside the data directory first. A database from
a newer version is never downgraded.

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
`npm install --global`. Your data is kept: run `delete-data` first if you want it gone.

## Troubleshooting

- **The dashboard says the service is not running.** Run `career-strike dashboard`; it starts the
  service and opens a new link. The page also recovers by itself once the service is back.
- **`doctor` reports `data-permissions`.** Run `chmod 700` on the data directory.
- **Port 47615 is in use.** Use `career-strike dashboard --port <port>`.
- **`restore` or `delete-data` says the service is running.** Run `career-strike stop` first.
