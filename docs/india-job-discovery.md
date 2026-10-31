# India job discovery

Career Strike uses employer-direct public ATS feeds before it considers a marketplace. This keeps
provenance, application links and freshness evidence intact, without bypassing logins, CAPTCHAs
or platform access controls.

When the Opportunities market filter is set to India, the dashboard also provides official-site
launchers for the reviewed marketplaces. The typed search phrase is passed directly to LinkedIn
or Indeed only in the new browser tab; Career Strike does not retrieve those results. For other
providers the launcher opens the official site, where the candidate searches directly.

## Reviewed employer-direct targets

These identities and board slugs were cross-checked on 2026-10-31 against the employer’s official
careers site and its public ATS board. They are eligible for live certification, but are **not**
live integrations until `verify-market` has successfully retrieved an explicitly Indian posting.

| Employer | Official careers site | Public board | Target id |
| --- | --- | --- | --- |
| Saviynt | [Careers](https://saviynt.com/careers) | [Lever](https://jobs.lever.co/saviynt) | `saviynt-india` |
| KRAFTON INDIA | [Jobs](https://krafton.in/jobs/) | [Greenhouse](https://job-boards.greenhouse.io/kraftonindia) | `krafton-india` |
| Sarvam AI | [Careers](https://www.sarvam.ai/careers) | [Ashby](https://jobs.ashbyhq.com/sarvam) | `sarvam-india` |
| Harvey | [Careers](https://www.harvey.ai/company/careers) | [Ashby](https://jobs.ashbyhq.com/harvey) | `harvey-india` |

Use a networked local installation to certify exactly one target:

    career-strike verify-market IN --target sarvam-india

The command calls the existing guarded public ATS adapter. It saves jobs and begins monitoring only
after the source returns a complete listing with at least one explicit India location. A timeout,
rate limit, invalid response or a listing without India evidence leaves the country configured and
saves nothing.

## Marketplace policy

| Source | Current capability | Career Strike behaviour |
| --- | --- | --- |
| [National Career Service](https://ncs.gov.in/) | `USER_DRIVEN_DISCOVERY` | Open the official portal; no automated job retrieval is claimed. |
| [LinkedIn Jobs](https://www.linkedin.com/legal/jobs-terms-conditions) | `RESTRICTED` | No scraping or automated extraction; use the official site or a user-supplied listing. |
| [Indeed](https://docs.indeed.com/legal-terms/developer-agreement) | `UNVERIFIED` | No integration until approved partner access and permitted display/reuse are confirmed. |
| Naukri, Foundit, Cutshort, Instahyre, Hirist | `UNVERIFIED` | No automated retrieval; open the official site or add a verified official listing manually. |

The `UNVERIFIED` label means Career Strike has no recorded approved access; it does not imply a
source is prohibited. A source can move only after its official access model, terms, fields,
display/reuse rights, limits and live retrieval have been reviewed.

## Candidate workflow

1. Start with the monitored employer-direct roles, filtering for city, remote eligibility and
   freshness.
2. Use NCS and other marketplaces in the browser for broader user-driven discovery.
3. Add only the official employer application link when recording a manually discovered job.
   Career Strike stores it as unverified until an authorised source confirms it.
4. Treat remote, sponsorship and work authorisation as unknown unless the employer explicitly
   states them. In particular, a remote India role is not globally remote.
