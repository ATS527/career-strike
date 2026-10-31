# A practical job-hunt guide

Career Strike is a private workspace for running a deliberate job search. It does not promise a
job, send applications for you or turn a job board into a source of facts it does not contain.
It helps you make the next good decision, preserve evidence, and avoid repeating work.

Use this guide in order for a first search, then return to the weekly routine. The app works
without any AI assistant.

## The first hour

### 1. Protect your starting point

Install, initialise and open Career Strike as described in [install.md](install.md). Your data is
kept locally. Before adding documents or personal history, read the short version of the
[privacy model](privacy.md): only public ATS requests leave the computer; the dashboard,
applications and profile remain local.

If you already have a spreadsheet or notes, do not rush to copy everything. Begin with roles that
are active or that you will apply for next. Use **Add a job** to record an opportunity you found
elsewhere; it remains visibly **Unverified** until a permitted source can verify it.

### 2. Build a useful profile, not a perfect autobiography

Open **Profile** and add facts that you are comfortable using in a job comparison:

- core skills and technologies you have actually used;
- previous roles, domains and outcomes;
- education, certifications and languages where relevant;
- a résumé text extract if you want Career Strike to suggest facts for your review.

Approve only true suggestions. A missing skill is better than an invented one. The app explains
fit from saved profile facts and quoted employer requirements; it cannot infer experience that you
did not add.

### 3. Tell Career Strike what “right for me” means

Open **Settings** and set a small, usable starting point:

| Setting | Why it matters | Example |
| --- | --- | --- |
| Preferred roles | Helps role and skills matching | Backend engineer, iOS engineer, technical product manager |
| Target countries and cities | Ranks places you want to work | `IN`, then Bengaluru and Pune |
| Country of residence and countries you can work in | Checks location eligibility | `IN`; other countries only when you are authorised there |
| Work authorisation by country | Keeps sponsorship separate from location preference | `DE=needs_sponsorship` |
| Work arrangement and employment types | Removes roles you do not want | Remote or hybrid; full-time |
| Salary expectation | Compares only against published salaries | A minimum in the currency and period you choose |
| Excluded employers | Prevents repeated distractions | Organisations you have decided not to pursue |

Target countries are a preference; they are not proof that you may work there. A job can be a
good location preference but still be ineligible if it explicitly requires work authorisation you
do not have. Conversely, a viable role outside a preferred city is not hidden—it is simply ranked
lower.

## Find trustworthy opportunities

### Start with employer-direct boards

Under **Opportunities → Job boards**, add public Greenhouse, Lever or Ashby careers pages for
employers you genuinely want to follow. These are the supported automated discovery paths. When
you add a board or choose **Fetch now**, Career Strike records source, application link and the
last successful retrieval. You may enable a refresh interval while the local service is running.

Choose employers deliberately. A useful first list is 10–30 organisations that match your role,
location and domain interests. Prefer the employer’s official careers page over a copy on another
site where both describe the same role.

### Use marketplaces as research, not as hidden automation

For websites that do not provide verified permitted access, search on the provider's own site and
open the employer’s official posting before tracking it. Career Strike will not work around a
login, CAPTCHA, paywall or platform restriction.

For India, use the dashboard’s official-site launchers and follow the detailed
[India discovery guide](india-job-discovery.md). It distinguishes monitored employer-direct
boards, user-driven portals and restricted/unverified marketplaces. India should be called
**Discovery available** only after `career-strike verify-market IN --target <id>` succeeds from a
networked local installation with an explicit India posting.

Germany, India, Singapore, Malaysia, Indonesia, the Philippines, Thailand and Vietnam can be
selected as markets today. A configured market is not the same as automated coverage. See
[known limitations](limitations.md#job-sources) before relying on a source.

### Use a five-minute capture rule

When you find a promising role outside a monitored board:

1. Check that the employer and application URL are official.
2. Add the role with its title, employer, location and official link.
3. Keep it **Unverified** unless an authorised board confirms it.
4. Add a short candidate note explaining why it may be worth attention.
5. Do not apply from a marketplace copy if the employer posting has disappeared or conflicts.

This creates a useful record without pretending the vacancy is still active.

## Decide what to pursue

Open **Opportunities** and use the filters in this sequence:

1. Pick a market and, when useful, a city.
2. Start with **Verified open** or **Recently verified**.
3. Filter for work arrangement, seniority/title terms and source.
4. Use **Best fit** only after you have added profile facts and preferences.
5. Open a role before shortlisting it; the summary is not the application.

The detail view tells you why a role is ranked. Read the factors separately:

| Signal | What it answers | Safe interpretation |
| --- | --- | --- |
| Skill fit | Do your saved skills match stated requirements? | Missing skill evidence is not a verdict on your potential. |
| Eligibility | Does the posting name a country where you may work? | Unknown means the source did not give enough evidence. |
| Work authorisation | Does the stated sponsorship policy fit your saved status? | Only an explicit “no sponsorship” blocks a candidate who needs it. |
| Target market | Is this in a preferred country or city? | A mismatch lowers preference, not legal eligibility. |
| Freshness | Has the source listed it recently? | Stale or unverified roles need a manual check. |

Remote is not automatically worldwide. A remote job can be limited to a country, region or time
zone. Sponsorship is separate again. Keep unknown fields unknown until the employer says more.

### A simple shortlist standard

Shortlist a role when all of these are true:

- the title and work are genuinely interesting;
- the employer posting still exists;
- no explicit eligibility or sponsorship conflict is shown;
- you can name one or two truthful reasons your experience is relevant; and
- you are willing to prepare a tailored application within the next few days.

Mark **Not for me** when you have made a real decision. This is not failure; it makes the next
search cleaner. Use comparison for two to four similar shortlisted roles when deciding where to
spend effort.

## Prepare and submit safely

The application workflow is intentionally separated from submission:

```text
Discovered → Evaluated → Shortlisted → Prepared → Awaiting approval
        → Submitted → Follow-up → Interview → Offer / Rejected / Withdrawn / Closed
```

For each shortlisted role:

1. Open the official application URL and read the current description again.
2. Choose **Prepare an application** in Career Strike.
3. Tailor the résumé, cover letter and notes to statements you can support.
4. Review the package in **Applications**. Approval signs that exact version; editing it cancels
   the approval.
5. Submit it yourself on the employer’s official site.
6. Record **Submitted** only after you see a confirmation or complete the application yourself.
7. Add a follow-up reminder and record recruiter replies, tests and interviews as they happen.

Opening a URL is not a submission. A prepared draft is not a submission. Career Strike does not
upload your documents, send email, message a recruiter or submit a real application for you.

## Run a sustainable weekly rhythm

### Each working day: 20–45 minutes

- Check **Home** for the next best actions.
- Review newly verified roles from your selected boards.
- Make one clear decision on each role: exclude, shortlist or leave it for later.
- Prepare or submit only the number of applications you can tailor truthfully.
- Update the pipeline immediately after an employer interaction.

### Once a week: 30–60 minutes

- Refresh the employer boards that matter; investigate any degraded board rather than assuming
  all its jobs closed.
- Review stale and unverified roles; verify them on the employer site or close them honestly.
- Check follow-ups and upcoming interviews.
- Look at **Insights** and its campaign summary. It uses recorded events and sample sizes, not
  fabricated success rates. Accept a suggestion only if it makes sense to you.
- Remove employers, titles or locations that are no longer part of your search. Add one or two
  new target employers rather than hundreds of broad sources.
- Create a backup before a major rewrite of your profile or search strategy.

### At the end of a search phase

Export or back up your workspace. Use the actual history—not memory—to review which markets,
employer types and role families produced useful conversations. Treat a small sample as a prompt
for exploration, not proof of cause.

## Optional: work with an AI assistant

Career Strike can connect Codex, Claude Code or OpenCode through MCP, but they are optional. An
assistant may help search the local collected roles, compare jobs or draft a structured summary.
It cannot submit applications, approve them, access your documents or contact details, or change
your settings.

Start with the connection instructions in [install.md](install.md#connecting-an-ai-assistant-optional).
If an assistant requests profile information, read its stated purpose and inspect the exact values
in **Settings → AI assistants** before approving. Share the smallest amount needed. An approval is
single-use.

For an MCP-capable client outside the built-in integrations, use the generic route documented in
[install.md](install.md#any-compatible-mcp-client). This includes an Axym deployment only when its
operator has confirmed local stdio MCP support; Axym is never required for Career Strike to work.

## When something is unclear

- A job is missing: make sure the correct board was added and check its source health. Career
  Strike does not search every employer on the internet.
- A job seems closed: distinguish a source timeout from evidence of closure. Check the employer
  link and the last verified time.
- Eligibility is unknown: keep it unknown, then ask the employer or read the official policy.
- A source asks for a login or CAPTCHA: use it manually in your browser; do not attempt to bypass
  it.
- You want to change direction: edit target roles, countries and cities first; your existing jobs
  and applications remain in the local workspace.
- You need to recover: use `career-strike doctor`, then consult [install.md](install.md) for
  backup, restore and troubleshooting.

The aim is not to maximize a job count. It is to keep a short, evidence-backed queue of roles you
can pursue well.
