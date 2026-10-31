# Known limitations

What Career Strike does not do, or does only partly, as of version 0.1.0. Feature status is
tracked with evidence in `acceptance/registry.json`.

## By design

- **No automated submission to real employers.** You submit on the employer's site; Career Strike
  prepares the package, records your confirmation and tracks the outcome. Automated submission is
  limited to the owned practice endpoint used to test the process.
- **No recruiter messaging, email or calendar access.** Career Strike does not connect to your
  accounts. Follow-ups are reminders for you to act on.
- **No CAPTCHA, login or anti-bot workarounds.** Only public, documented job-board APIs are used.
- **Assistants never see contact details or documents,** even with your approval.

## Job sources

- Only public Greenhouse, Lever and Ashby job boards can be monitored. Jobs from anywhere else can
  be added by hand and stay marked as unverified.
- Germany, India, Singapore, Malaysia, Indonesia, the Philippines, Thailand and Vietnam are
  configured as search markets for country/location filtering. This is **not** marketplace
  coverage: none is labelled discovery-available until Career Strike has a permitted source and
  successful retrieval evidence for that market. The existing employer-direct ATS integrations
  may return roles in any of those markets when the candidate supplies a valid employer board.
- Naukri, Foundit, LinkedIn, Indeed, JobStreet, JobsDB, Glints, Kalibrr, MyCareersFuture,
  Hiredly, VietnamWorks, TopCV and similar marketplaces are not fetched by Career Strike. Use an
  official link or add a role manually unless a future release records authorised access.
- India and Singapore have four curated employer-direct candidates each: Saviynt (Lever),
  KRAFTON INDIA (Greenhouse), Sarvam AI (Ashby) and Harvey (Ashby) for India; Stripe, Databricks,
  Coinbase and Twilio (all Greenhouse) for Singapore. Germany has four (HelloFresh, Doctolib,
  Celonis, SumUp — all Greenhouse) and Southeast Asia shares three regional boards (Ninja Van on
  Lever, Agoda and Xendit on Greenhouse) covering Malaysia, Indonesia, the Philippines, Thailand
  and Vietnam. The Philippines also has two dedicated candidates (AvePoint and Mitsogo, both
  Greenhouse) and Vietnam has two (Amanotes on Lever, Sky Mavis on Ashby). Their employer and
  board identities have been reviewed, but a market stays
  **CONFIGURED** for a fresh installation until `career-strike verify-market <CC> --target <id>`
  completes a live permitted fetch with an explicitly located posting. Only then does the command
  save and monitor that board and allow the local installation to call the market
  **DISCOVERY_AVAILABLE**.
- A curated board is adopted once per installation. A board certified for one market also serves
  its explicitly located postings in the other markets it was reviewed for; a market whose boards
  are all adopted through other markets therefore has no separate certification command, and
  claims discovery only through those monitored feeds.
- A posting counts as open only if its board listed it within the last 72 hours. Boards are
  checked when you add them, when you press **Fetch now**, and on your chosen schedule.
- Scheduled checks run only while the service is running; there is no operating-system background
  job that starts it for you.
- Salary is shown only when the employer published it.
- Employer application questions are read from Greenhouse's public form data. For Lever and Ashby,
  the questions are not available through their public APIs, so the package covers your details
  and documents and you answer the employer's questions on their site.

## Matching and insights

- Fit is explained rule by rule from your approved profile and the posting's stated requirements.
  Skills are recognised from a built-in dictionary of common technologies; a skill it does not know
  is not matched automatically. Names that are ordinary words or single letters are recognised
  only in unambiguous spellings (for example "Golang" or "Go language", not "Go"; "C" and "R" not
  at all), so some real requirements are missed rather than invented.
- Skill suggestions are read from résumé text you paste on the Profile page. Text is not extracted
  from PDF or Word files; paste their text instead.
- Insights compare sources only with at least 10 submitted applications per source, and never
  claim a cause. Silence from employers is not treated as feedback.
- Country and city normalisation is deterministic and limited to configured market aliases. A
  remote role is not treated as globally eligible unless an authorised source explicitly states
  that fact. Sponsorship, work authorisation and relocation assistance remain unknown unless a
  source supplies evidence.

## Platforms and installation

- Tested on macOS with Node 24 and Chromium. Linux should work but is not part of the tested
  set; Windows is not tested.
- Signing keys use the macOS keychain; on other systems they are owner-only files in the data
  directory.
- Not published to the npm registry; install from a package you build (see
  [install.md](install.md)).
- AI assistant support is certified against specific installed versions of Codex, Claude Code
  and OpenCode (recorded in `acceptance/evidence/real-host/`). Other versions may change how they
  store MCP settings.
- Axym is not a Career Strike dependency or a certified host integration. An Axym deployment may
  use the generic local MCP route only after its operator confirms that it supports the required
  stdio configuration and verifies the connection locally.
- The dashboard is in English only.

## Backup and restore

- Backups do not include signing keys. After restoring on another computer, approvals given
  before the backup must be given again.
- `restore` and `delete-data` require the service to be stopped.
