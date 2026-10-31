# Germany job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls.

When the Opportunities market filter is set to Germany, the dashboard also provides official-site
launchers for the reviewed marketplaces. The typed search phrase is passed directly to LinkedIn or
Indeed only in the new browser tab; Career Strike does not retrieve those results. For other
providers (such as the Bundesagentur für Arbeit) the launcher opens the official site, where the
candidate searches directly.

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-10-31 against the employer's official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly German posting.

| Employer | Official careers site | Public board | Target id |
| --- | --- | --- | --- |
| HelloFresh | [Careers](https://careers.hellofresh.com/global/en) | [Greenhouse](https://job-boards.greenhouse.io/hellofresh) | `hellofresh-de` |
| Doctolib | [Careers](https://careers.doctolib.com) | [Greenhouse](https://job-boards.greenhouse.io/doctolib) | `doctolib-de` |
| Celonis | [Careers](https://careers.celonis.com) | [Greenhouse](https://job-boards.greenhouse.io/celonis) | `celonis-de` |
| SumUp | [Careers](https://www.sumup.com/careers/) | [Greenhouse](https://job-boards.greenhouse.io/sumup) | `sumup-de` |

On the review date the public board APIs returned complete listings with Germany-located postings
for all four employers (HelloFresh 90, Doctolib 65, Celonis 56, SumUp 49). The HelloFresh, Celonis
and SumUp boards redirect `job-boards.greenhouse.io` to the employer's own careers search; the
redirect target is that employer's site rendering the same board, which corroborates ownership.

Use a networked local installation to certify exactly one target:

    career-strike verify-market DE --target hellofresh-de

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit German location. A timeout,
rate limit, invalid response or a listing without Germany evidence leaves the country configured
and saves nothing.

## Marketplace policy

| Source | Current capability | Career Strike behaviour |
| --- | --- | --- |
| [Bundesagentur für Arbeit](https://www.arbeitsagentur.de/jobsuche/) | `USER_DRIVEN_DISCOVERY` | Open the official public employment-agency search; no automated job retrieval is claimed. |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions) | `RESTRICTED` | No scraping or automated extraction; use the official site or a user-supplied listing. |
| [Indeed Deutschland](https://docs.indeed.com/legal-terms/developer-agreement) | `UNVERIFIED` | No integration until approved partner access and permitted display/reuse are confirmed. |
| StepStone, Xing | `UNVERIFIED` | No automated retrieval; open the official site or add a verified official listing manually. |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for freshness and fit.
2. Use the Bundesagentur für Arbeit and other portals in the browser for broader user-driven
   discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. German-language postings ("München") normalise to Munich through the configured
   alias list.
