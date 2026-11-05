# Changelog

Every release of Career Strike is listed here, newest first. The section for a version is shown in
the dashboard after you update, and is published as that version's release notes on GitHub.

## [0.3.0] - 2026-11-05

### Added

- Tailwind CSS v4 is now part of the dashboard build, with Career Strike design tokens for brand
  colors, typography, spacing, radii and surfaces.
- React Hook Form now manages dashboard forms such as Add Job, with React Hook Form plus Zod-ready
  resolver support available for further form migrations.
- `career-strike uninstall` now asks whether to delete locally stored candidate data. The default
  is No; data is preserved unless you explicitly confirm deletion. Non-interactive uninstalls
  keep data by default and require `--delete-data --confirm "delete my career data"` for removal.
- Uninstall now offers an optional backup before deleting candidate data and shows the exact
  Career Strike-managed files and folders it would remove.

### Changed

- The dashboard keeps its existing Career Strike visual identity while Tailwind CSS is introduced
  for layout and component styling.
- Candidate data safety documentation now describes uninstall data retention and explicit deletion
  consent.

### Fixed

- Uninstall no longer implies consent to delete personal data from a generic confirmation.

## [0.2.0] - 2026-11-01

The first published release. From now on, `career-strike update` keeps you current.

### Added

- `career-strike update`: installs the newest release in one step. It checks the download against
  its published checksum (and its build provenance, if the GitHub CLI is signed in), backs up your
  data, restarts the service and confirms the new version works. If anything fails, the previous
  version and your data are put back automatically.
- `career-strike update --undo` returns to the version you had before the last update.
  `career-strike update --check` only says whether a new version exists.
- Optional weekly update checks (Settings → Background monitoring, or asked once by
  `career-strike init`). Off unless you turn them on. When a new version is out, the dashboard
  says so; after you update, it shows what changed.
- Settings → Updates shows your version, the last check, and a "Check now" button.
- `career-strike status` warns when the running service is older than the installed program.
- `npm run dev` for working on the dashboard with hot reload.

### Changed

- The dashboard's navigation and data loading were rebuilt on TanStack Router and TanStack
  Query. Pages, links and bookmarks work as before; a page opened during a service outage now
  loads by itself once the service is back.
- More consistent spacing above form buttons.

### Updating from 0.1.0

0.1.0 has no `update` command, so this one update is done by hand. See
[Updating](docs/install.md#updating).

## [0.1.0]

Initial development version, installed by building from source.
