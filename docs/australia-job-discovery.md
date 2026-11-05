# Australia job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls.

When the Opportunities market filter is set to Australia, the dashboard also provides official-site
launchers for the reviewed marketplaces. The typed search phrase is passed directly to LinkedIn or
Indeed only in the new browser tab; Career Strike does not retrieve those results. For other
providers the launcher opens the official site, where the candidate searches directly.

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-11-01 against the employer's official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly Australian posting.

| Employer    | Official careers site                                      | Public board                                              | Target id       |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------- | --------------- |
| Culture Amp | [Careers](https://www.cultureamp.com/company/careers)      | [Greenhouse](https://job-boards.greenhouse.io/cultureamp) | `cultureamp-au` |
| Mable       | [Careers](https://mable.com.au/about-us/careers-at-mable/) | [Lever](https://jobs.lever.co/mable)                      | `mable-au`      |
| Deputy      | [Careers](https://www.deputy.com/careers)                  | [Lever](https://jobs.lever.co/deputy)                     | `deputy-au`     |
| Immutable   | [Careers](https://www.immutable.com/careers)               | [Lever](https://jobs.lever.co/immutable)                  | `immutable-au`  |

On the review date the public board APIs returned complete listings with Australia-located postings
for all four employers (Culture Amp 14, Mable 12, Deputy 6, Immutable 4). Culture Amp's and
Immutable's careers pages link their boards directly, and Mable's own careers page links its Lever
board at jobs.lever.co/mable. Australian locations on these boards read as "Sydney", "Melbourne"
or "Sydney, Brisbane, Melbourne".

Use a networked local installation to certify exactly one target:

    career-strike verify-market AU --target cultureamp-au

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit Australia location. A
timeout, rate limit, invalid response or a listing without Australia evidence leaves the country
configured and saves nothing.

## Marketplace policy

| Source                                                                      | Current capability      | Career Strike behaviour                                                                            |
| --------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| [Workforce Australia](https://www.workforceaustralia.gov.au/)               | `USER_DRIVEN_DISCOVERY` | Open the official Australian Government employment service; no automated job retrieval is claimed. |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions)       | `RESTRICTED`            | No scraping or automated extraction; use the official site or a user-supplied listing.             |
| [Indeed Australia](https://docs.indeed.com/legal-terms/developer-agreement) | `UNVERIFIED`            | No integration until approved partner access and permitted display/reuse are confirmed.            |
| Seek                                                                        | `UNVERIFIED`            | No automated retrieval; open the official site or add a verified official listing manually.        |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for freshness and fit.
2. Use Workforce Australia, Seek and other marketplaces in the browser for broader user-driven
   discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. In particular, a "Remote - Sydney" posting is an Australian role, not a globally
   remote one, and Australian employment usually depends on an employer-sponsored visa or existing
   work rights.
